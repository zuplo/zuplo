import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  healthScoreRepository,
  type HealthScore,
} from "../repositories/health-scores.ts";

interface Body {
  accountId: string;
  drivers: HealthScore["drivers"];
}

/**
 * Compute a new health score from caller-supplied drivers and append it.
 * Production forks usually replace the body-driven flow with an internal
 * computation off product usage events; the storage shape is the same.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  // Weighted-average score, clamped 0..100, mapped to a tier.
  const totalWeight = body.drivers.reduce((sum, d) => sum + d.weight, 0) || 1;
  const weighted =
    body.drivers.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight;
  const scoreValue = Math.max(0, Math.min(100, Math.round(weighted)));
  const tier: HealthScore["tier"] =
    scoreValue >= 75 ? "green" : scoreValue >= 50 ? "yellow" : "red";

  const created = await healthScoreRepository.create(tenantId, {
    accountId: body.accountId,
    scoreValue,
    tier,
    drivers: body.drivers,
    computedAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
