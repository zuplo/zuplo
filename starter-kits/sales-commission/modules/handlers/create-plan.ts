import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { compPlanRepository, type AcceleratorTier } from "../repositories/comp-plans.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    name: string;
    baseRate: number;
    accelerators?: AcceleratorTier[];
    period: string;
  };

  const created = await compPlanRepository.create(tenantId, {
    name: body.name,
    baseRate: body.baseRate,
    accelerators: body.accelerators ?? [],
    period: body.period,
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
