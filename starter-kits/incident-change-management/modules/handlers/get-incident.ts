import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { incidentRepository } from "../repositories/incidents.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const incident = await incidentRepository.get(tenantId, id);
  if (!incident) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Incident not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(incident), {
    headers: { "content-type": "application/json" },
  });
}
