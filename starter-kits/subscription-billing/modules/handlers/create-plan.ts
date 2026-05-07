import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { planRepository, type Plan } from "../repositories/subscriptions.ts";

interface Body {
  name: string;
  intervalUnit: Plan["intervalUnit"];
  priceCents: number;
  currency: string;
  includedUsage: number;
  overageRateCents: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await planRepository.create(tenantId, {
    name: body.name,
    intervalUnit: body.intervalUnit,
    priceCents: body.priceCents,
    currency: body.currency,
    includedUsage: body.includedUsage,
    overageRateCents: body.overageRateCents,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
