import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { incidentRepository } from "../repositories/incidents.ts";
import {
  incidentUpdateRepository,
  type IncidentUpdate,
} from "../repositories/incident-updates.ts";

interface Body {
  body: string;
  status: IncidentUpdate["status"];
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

  return new Response(JSON.stringify(update), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
