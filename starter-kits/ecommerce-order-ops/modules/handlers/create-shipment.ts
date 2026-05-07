import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { shipmentRepository } from "../repositories/shipments.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    orderId: string;
    carrier: string;
    service: string;
    trackingNumber: string;
  };

  const created = await shipmentRepository.create(tenantId, {
    orderId: body.orderId,
    carrier: body.carrier,
    service: body.service,
    trackingNumber: body.trackingNumber,
    status: "label_purchased",
    shippedAt: null,
    deliveredAt: null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
