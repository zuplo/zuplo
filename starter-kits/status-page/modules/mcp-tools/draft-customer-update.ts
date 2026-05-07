import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { incidentRepository } from "../repositories/incidents.ts";
import {
  incidentUpdateRepository,
  type IncidentUpdate,
} from "../repositories/incident-updates.ts";

/**
 * Orchestrator MCP tool: draft_customer_update.
 *
 * Reads the incident's full timeline plus the affected components, and
 * returns a *ready-to-post* update body shaped for the requested audience
 * (customer-facing or internal). The LLM never has to reconstruct the
 * timeline by itself; it just calls this and posts the returned text.
 */

interface Body {
  incidentId: string;
  audience?: "customer" | "internal";
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.incidentId) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "incidentId is required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const audience = body.audience ?? "customer";

  const incident = await incidentRepository.get(tenantId, body.incidentId);
  if (!incident) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Incident not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  // Pull every update on this incident. In a busy tenant this would paginate.
  const allUpdates: IncidentUpdate[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const page = await incidentUpdateRepository.list(tenantId, {
      limit: 200,
      cursor: cursor ?? undefined,
      orderBy: { field: "postedAt", direction: "asc" },
    });
    for (const u of page.items) {
      if (u.incidentId === body.incidentId) allUpdates.push(u);
    }
    cursor = page.nextCursor;
    if (allUpdates.length > 500) break;
  } while (cursor);

  const minutesElapsed = Math.max(
    1,
    Math.round(
      (Date.now() - new Date(incident.startedAt).getTime()) / (60 * 1000),
    ),
  );
  const lastStatus = allUpdates.at(-1)?.status ?? incident.status;
  const componentList =
    incident.affectedComponentSlugs.length > 0
      ? incident.affectedComponentSlugs.join(", ")
      : "the platform";

  const draft =
    audience === "internal"
      ? [
          `Incident ${incident.id} (${incident.impact} impact) status: ${lastStatus} — ${minutesElapsed}m elapsed.`,
          `Components: ${componentList}.`,
          `Timeline (${allUpdates.length} updates):`,
          ...allUpdates.map(
            (u) => `  • ${u.postedAt} [${u.status}] ${u.body}`,
          ),
        ].join("\n")
      : [
          `We are currently ${lastStatus === "resolved" ? "back to normal after" : "working on"} an issue affecting ${componentList}.`,
          allUpdates.length > 1
            ? `We last updated ${allUpdates.at(-1)?.postedAt}.`
            : `We will share the next update within 30 minutes.`,
          `Thank you for your patience.`,
        ].join(" ");

  return new Response(
    JSON.stringify({
      incidentId: incident.id,
      audience,
      currentStatus: lastStatus,
      minutesElapsed,
      affectedComponents: incident.affectedComponentSlugs,
      timelineLength: allUpdates.length,
      draft,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
