import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { usageRepository } from "../repositories/subscriptions.ts";

interface Body {
  subscriptionId: string;
  quantity: number;
  recordedAt: string;
  periodStart: string;
  periodEnd: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await usageRepository.create(tenantId, {
    subscriptionId: body.subscriptionId,
    quantity: body.quantity,
    recordedAt: body.recordedAt,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
