import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { subscriptionRepository } from "../repositories/subscriptions.ts";

interface Body {
  customerId: string;
  planId: string;
  startDate: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEnd?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await subscriptionRepository.create(tenantId, {
    customerId: body.customerId,
    planId: body.planId,
    status: "active",
    startDate: body.startDate,
    currentPeriodStart: body.currentPeriodStart,
    currentPeriodEnd: body.currentPeriodEnd,
    trialEnd: body.trialEnd ?? null,
    canceledAt: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
