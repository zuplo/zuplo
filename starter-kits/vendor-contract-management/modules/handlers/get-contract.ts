import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { contractRepository } from "../repositories/contracts.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const contract = await contractRepository.get(tenantId, id);
  if (!contract) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Contract not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(contract), {
    headers: { "content-type": "application/json" },
  });
}
