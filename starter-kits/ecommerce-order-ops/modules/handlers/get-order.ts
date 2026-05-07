import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { orderRepository } from "../repositories/orders.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const order = await orderRepository.get(tenantId, id);
  if (!order) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Order not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(order), {
    headers: { "content-type": "application/json" },
  });
}
