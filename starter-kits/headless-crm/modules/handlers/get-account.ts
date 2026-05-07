import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { accountRepository } from "../repositories/accounts.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const account = await accountRepository.get(tenantId, id);
  if (!account) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Account not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(account), { headers: { "content-type": "application/json" } });
}
