import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { orderRepository } from "../repositories/orders.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    eventId: string;
    attendeeEmail: string;
    attendeeName: string;
    totalCents: number;
    currency?: string;
  };

  const created = await orderRepository.create(tenantId, {
    eventId: body.eventId,
    attendeeEmail: body.attendeeEmail,
    attendeeName: body.attendeeName,
    totalCents: body.totalCents,
    currency: body.currency ?? "USD",
    status: "pending",
    placedAt: new Date().toISOString(),
    paidAt: null,
    refundedAt: null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
