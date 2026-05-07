import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { ticketTypeRepository } from "../repositories/ticket-types.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    eventId: string;
    name: string;
    priceCents: number;
    quantity: number;
    salesStart: string;
    salesEnd: string;
  };

  const created = await ticketTypeRepository.create(tenantId, {
    eventId: body.eventId,
    name: body.name,
    priceCents: body.priceCents,
    quantity: body.quantity,
    soldQuantity: 0,
    salesStart: body.salesStart,
    salesEnd: body.salesEnd,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
