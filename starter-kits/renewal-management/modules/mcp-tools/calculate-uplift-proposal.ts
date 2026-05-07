import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { RenewalOpportunity } from "../repositories/renewals.ts";
import type { RiskFactor } from "../repositories/risk-factors.ts";

interface Body {
  renewalId: string;
  targetUpliftPercent?: number;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Orchestrator: calculate_uplift_proposal.
 *
 * Suggests a new ARR figure for the renewal. Defaults to a 7% uplift, but
 * caps based on open risk-factor severity:
 *   - any high-severity open risk → cap uplift at 0% (hold the line)
 *   - any med-severity → cap at 3%
 *   - else → use targetUpliftPercent
 * Also recommends a riskTier consistent with the open-risk profile.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const target = body.targetUpliftPercent ?? 7;

  const renewal = await invokeJson<RenewalOpportunity>(
    context,
    `/renewals/${body.renewalId}`,
    { headers: { authorization: auth } },
  );
  const risksPage = await invokeJson<Page<RiskFactor>>(
    context,
    `/risk-factors?renewalId=${encodeURIComponent(body.renewalId)}&open=true&limit=200`,
    { headers: { authorization: auth } },
  );
  const openRisks = risksPage.items;

  const hasHigh = openRisks.some((r) => r.severity === "high");
  const hasMed = openRisks.some((r) => r.severity === "med");

  let recommendedUpliftPercent = target;
  let recommendedRiskTier: RenewalOpportunity["riskTier"] = "low";
  if (hasHigh) {
    recommendedUpliftPercent = 0;
    recommendedRiskTier = "high";
  } else if (hasMed) {
    recommendedUpliftPercent = Math.min(target, 3);
    recommendedRiskTier = "med";
  }

  const recommendedArrCents = Math.round(
    renewal.currentArrCents * (1 + recommendedUpliftPercent / 100),
  );

  return new Response(
    JSON.stringify({
      renewalId: body.renewalId,
      currentArrCents: renewal.currentArrCents,
      target,
      recommendedUpliftPercent,
      recommendedArrCents,
      recommendedRiskTier,
      drivers: { hasHigh, hasMed, openRiskCount: openRisks.length },
    }),
    { headers: { "content-type": "application/json" } },
  );
}
