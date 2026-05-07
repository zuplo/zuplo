import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { RenewalOpportunity } from "../repositories/renewals.ts";
import type { Contract } from "../repositories/contracts.ts";
import type { RiskFactor } from "../repositories/risk-factors.ts";
import type { Negotiation } from "../repositories/negotiations.ts";

interface Body {
  renewalId: string;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Orchestrator: prep_renewal_briefing.
 *
 * Pulls everything an AE needs for a renewal call: the opportunity, the
 * underlying contract, open and closed risk factors, and the full
 * negotiation history. Returns a structured briefing the LLM can shape
 * into talking points.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";

  const renewal = await invokeJson<RenewalOpportunity>(
    context,
    `/renewals/${body.renewalId}`,
    { headers: { authorization: auth } },
  );
  const contract = await invokeJson<Contract>(
    context,
    `/contracts/${renewal.contractId}`,
    { headers: { authorization: auth } },
  );
  const risksPage = await invokeJson<Page<RiskFactor>>(
    context,
    `/risk-factors?renewalId=${encodeURIComponent(body.renewalId)}&limit=200`,
    { headers: { authorization: auth } },
  );
  const negPage = await invokeJson<Page<Negotiation>>(
    context,
    `/negotiations?renewalId=${encodeURIComponent(body.renewalId)}&limit=200`,
    { headers: { authorization: auth } },
  );

  const openRisks = risksPage.items.filter((r) => r.addressedAt === null);
  const addressedRisks = risksPage.items.filter((r) => r.addressedAt !== null);
  const openNegotiations = negPage.items.filter((n) => n.status === "open");
  const decided = negPage.items.filter((n) => n.status !== "open");

  const daysToRenewal = Math.ceil(
    (new Date(renewal.renewsOn).getTime() - Date.now()) / 86400000,
  );
  const upliftPercent =
    renewal.currentArrCents > 0
      ? Math.round(
          ((renewal.proposedArrCents - renewal.currentArrCents) /
            renewal.currentArrCents) *
            100,
        )
      : 0;

  return new Response(
    JSON.stringify({
      renewal,
      contract,
      daysToRenewal,
      upliftPercent,
      openRisks,
      addressedRisks,
      openNegotiations,
      decided,
      narrative: `${contract.accountId} renews in ${daysToRenewal} days. Risk: ${renewal.riskTier}. Uplift proposed: ${upliftPercent}%. ${openRisks.length} open risks, ${openNegotiations.length} open negotiations.`,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
