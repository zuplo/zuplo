import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { billRepository } from "../repositories/bills.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const bill = await billRepository.get(tenantId, id);
  if (!bill) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Bill not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(bill), {
    headers: { "content-type": "application/json" },
  });
}
