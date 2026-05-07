import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { dealRepository } from "../repositories/deals.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const deal = await dealRepository.get(tenantId, id);
  if (!deal) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Deal not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(deal), { headers: { "content-type": "application/json" } });
}
