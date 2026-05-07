import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { quoteRepository } from "../repositories/quotes.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const quote = await quoteRepository.get(tenantId, id);
  if (!quote) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Quote not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(quote), {
    headers: { "content-type": "application/json" },
  });
}
