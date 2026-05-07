import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { itemRepository } from "../repositories/items.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const item = await itemRepository.get(tenantId, id);
  if (!item) {
    return new Response(JSON.stringify({ error: { type: "not_found", message: "Item not found" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify(item), {
    headers: { "content-type": "application/json" },
  });
}
