import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { returnRepository } from "../repositories/returns.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    orderId: string;
    lineItemId: string;
    quantity: number;
    reason: string;
  };

  const created = await returnRepository.create(tenantId, {
    orderId: body.orderId,
    lineItemId: body.lineItemId,
    quantity: body.quantity,
    reason: body.reason,
    status: "requested",
    requestedAt: new Date().toISOString(),
    refundedAt: null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
