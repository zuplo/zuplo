import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { cadenceRepository } from "../repositories/cadences.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const cadence = await cadenceRepository.get(tenantId, id);
  if (!cadence) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Cadence not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(cadence), {
    headers: { "content-type": "application/json" },
  });
}
