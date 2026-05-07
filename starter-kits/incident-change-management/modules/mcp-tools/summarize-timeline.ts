import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import { requireTenant } from "../_shared/auth/index.ts";
import { incidentUpdateRepository, type Incident } from "../repositories/incidents.ts";

/**
 * Orchestrator: summarize_timeline.
 *
 * Returns a chronological view of an incident's status transitions and posted
 * updates. Useful for an LLM drafting a postmortem or status digest.
 */

interface Body {
  incidentId: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.incidentId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "incidentId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const tenantId = requireTenant(request);
  const auth = request.headers.get("authorization") ?? "";

  const incident = await invokeJson<Incident>(
    context,
    `/incidents/${encodeURIComponent(body.incidentId)}`,
    { headers: { authorization: auth } },
  );

  // Pull all updates in this tenant; filter to this incident.
  const allUpdates: Array<{
    at: string;
    body: string;
    postedBy: string;
    audience: "internal" | "customer";
    kind: "update";
  }> = [];
  let cursor: string | null | undefined;
  do {
    const page = await incidentUpdateRepository.list(tenantId, {
      limit: 200,
      cursor: cursor ?? undefined,
      orderBy: { field: "postedAt", direction: "asc" },
    });
    for (const u of page.items) {
      if (u.incidentId !== body.incidentId) continue;
      allUpdates.push({
        at: u.postedAt,
        body: u.body,
        postedBy: u.postedBy,
        audience: u.audience,
        kind: "update",
      });
    }
    cursor = page.nextCursor;
  } while (cursor);

  const transitions: Array<{ at: string; status: string; kind: "transition" }> = [
    { at: incident.declaredAt, status: "investigating", kind: "transition" },
  ];
  if (incident.resolvedAt) {
    transitions.push({ at: incident.resolvedAt, status: "resolved", kind: "transition" });
  }

  const timeline = [...allUpdates, ...transitions].sort((a, b) =>
    a.at.localeCompare(b.at),
  );

  return new Response(
    JSON.stringify({
      incidentId: incident.id,
      title: incident.title,
      severity: incident.severity,
      status: incident.status,
      declaredAt: incident.declaredAt,
      resolvedAt: incident.resolvedAt,
      durationMinutes: incident.resolvedAt
        ? Math.round(
            (Date.parse(incident.resolvedAt) - Date.parse(incident.declaredAt)) / 60_000,
          )
        : null,
      timeline,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
