import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { incidentUpdateRepository, type IncidentUpdate } from "../repositories/incidents.ts";

interface Body {
  incidentId: string;
  body: string;
  postedBy: string;
  audience?: IncidentUpdate["audience"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await incidentUpdateRepository.create(tenantId, {
    incidentId: body.incidentId,
    body: body.body,
    postedBy: body.postedBy,
    postedAt: new Date().toISOString(),
    audience: body.audience ?? "internal",
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
