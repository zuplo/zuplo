import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { purchaseRequestRepository } from "../repositories/purchase-requests.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const pr = await purchaseRequestRepository.get(tenantId, id);
  if (!pr) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Purchase request not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(pr), { headers: { "content-type": "application/json" } });
}
