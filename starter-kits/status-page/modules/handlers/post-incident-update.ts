import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { incidentRepository } from "../repositories/incidents.ts";
import {
  incidentUpdateRepository,
  type IncidentUpdate,
} from "../repositories/incident-updates.ts";
import { fanoutToSubscribers } from "../integrations/fanout.ts";

interface Body {
  body: string;
  status: IncidentUpdate["status"];
  /** When true, suppress subscriber fanout (e.g. for internal-only updates). */
  suppressFanout?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const incidentId = request.params.id;
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  // Confirm the incident exists in this tenant before posting an update.
  const existing = await incidentRepository.get(tenantId, incidentId);
  if (!existing) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Incident not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const update = await incidentUpdateRepository.create(tenantId, {
    incidentId,
    body: body.body,
    postedAt: now,
    status: body.status,
  });

  // Roll the incident's own status forward to match the latest update.
  try {
    await incidentRepository.update(tenantId, incidentId, {
      status: body.status,
      ...(body.status === "resolved" ? { resolvedAt: now } : {}),
    });
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }

  // Fan out the update to subscribers per their preferences.
  let fanout = { attempted: 0, delivered: 0, errors: [] as unknown[] };
  if (!body.suppressFanout) {
    try {
      const r = await fanoutToSubscribers(
        tenantId,
        {
          subject: `[Status update] ${existing.title} — ${body.status}`,
          text: body.body,
          impact: existing.impact === "none" ? "minor" : existing.impact,
          affectedComponents: existing.affectedComponentSlugs ?? [],
          dedupKey: `incident:${incidentId}:update:${update.id}`,
        },
        context,
      );
      fanout = r;
    } catch (err) {
      context.log.warn(
        `Fanout failed for update ${update.id}: ${(err as Error).message}`,
      );
    }
  }

  return new Response(JSON.stringify({ ...update, fanout }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
