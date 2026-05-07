import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { payoutRepository } from "../repositories/payouts.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const payout = await payoutRepository.get(tenantId, id);
  if (!payout) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Payout not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(payout), {
    headers: { "content-type": "application/json" },
  });
}
