import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { riskFactorRepository, type RiskFactor } from "../repositories/risk-factors.ts";

interface Body {
  renewalId: string;
  factor: string;
  severity: RiskFactor["severity"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await riskFactorRepository.create(tenantId, {
    renewalId: body.renewalId,
    factor: body.factor,
    severity: body.severity,
    addedAt: new Date().toISOString(),
    addressedAt: null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
