import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { transactionRepository } from "../repositories/transactions.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const tx = await transactionRepository.get(tenantId, id);
  if (!tx) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Transaction not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(tx), {
    headers: { "content-type": "application/json" },
  });
}
