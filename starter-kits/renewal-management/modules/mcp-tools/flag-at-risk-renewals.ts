import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { RenewalOpportunity } from "../repositories/renewals.ts";
import type { RiskFactor } from "../repositories/risk-factors.ts";

interface Body {
  daysAhead?: number;
  ownerEmail?: string;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Orchestrator: flag_at_risk_renewals.
 *
 * Lists renewals due in the next `daysAhead` (default 60) where riskTier is
 * `high` OR there's an open high-severity risk factor. Filterable by owner.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const daysAhead = body.daysAhead ?? 60;
  const cutoff = new Date(Date.now() + daysAhead * 86400000).toISOString();

  const qs = new URLSearchParams({ limit: "200" });
  if (body.ownerEmail) qs.set("ownerEmail", body.ownerEmail);
  const renewalsPage = await invokeJson<Page<RenewalOpportunity>>(
    context,
    `/renewals?${qs}`,
    { headers: { authorization: auth } },
  );

  const upcoming = renewalsPage.items.filter(
    (r) =>
      r.renewsOn <= cutoff &&
      (r.status === "upcoming" || r.status === "in_negotiation"),
  );

  const flagged: Array<{
    renewal: RenewalOpportunity;
    openHighRisks: RiskFactor[];
    reasons: string[];
  }> = [];
  for (const renewal of upcoming) {
    const risksPage = await invokeJson<Page<RiskFactor>>(
      context,
      `/risk-factors?renewalId=${encodeURIComponent(renewal.id)}&open=true&limit=50`,
      { headers: { authorization: auth } },
    );
    const openHigh = risksPage.items.filter((r) => r.severity === "high");
    const reasons: string[] = [];
    if (renewal.riskTier === "high") reasons.push("high risk tier");
    if (openHigh.length > 0) reasons.push(`${openHigh.length} open high-severity risk factor(s)`);
    if (reasons.length > 0) {
      flagged.push({ renewal, openHighRisks: openHigh, reasons });
    }
  }

  return new Response(
    JSON.stringify({
      filter: { daysAhead, ownerEmail: body.ownerEmail ?? null },
      flaggedCount: flagged.length,
      flagged,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
