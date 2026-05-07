import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { orderRepository, type Order } from "../repositories/orders.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    customerId: string;
    orderNumber: string;
    subtotalCents: number;
    shippingCents?: number;
    taxCents?: number;
    totalCents: number;
    currency?: string;
    fraudScore?: number;
    channel?: Order["channel"];
  };

  const created = await orderRepository.create(tenantId, {
    customerId: body.customerId,
    orderNumber: body.orderNumber,
    status: "pending",
    subtotalCents: body.subtotalCents,
    shippingCents: body.shippingCents ?? 0,
    taxCents: body.taxCents ?? 0,
    totalCents: body.totalCents,
    currency: body.currency ?? "USD",
    placedAt: new Date().toISOString(),
    paidAt: null,
    shippedAt: null,
    fraudScore: body.fraudScore ?? 0,
    channel: body.channel ?? "web",
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
