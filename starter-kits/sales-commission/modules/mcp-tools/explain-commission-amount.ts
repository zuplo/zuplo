import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Payout } from "../repositories/payouts.ts";
import type { Credit } from "../repositories/credits.ts";
import type { CompPlan } from "../repositories/comp-plans.ts";

/**
 * Orchestrator MCP tool: explain_commission_amount.
 *
 * Given a payoutId, walks the payout, the credits that fed it, and the
 * comp plan that priced it. Returns a step-by-step explanation: total
 * base credits, the accelerator threshold check, and the resulting
 * commission. Useful when a rep asks "where does this number come from?"
 */

interface Body {
  payoutId: string;
}

interface CreditPage {
  items: Credit[];
  nextCursor: string | null;
}

interface PlanPage {
  items: CompPlan[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const payout = await invokeJson<Payout>(context, `/payouts/${body.payoutId}`, {
    headers: auth,
  });

  // Find the comp plan whose period matches. Plans are not directly
  // referenced from a payout, so we resolve by period.
  const plans: CompPlan[] = [];
  let pCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (pCursor) qs.set("cursor", pCursor);
    const page = await invokeJson<PlanPage>(context, `/plans?${qs}`, { headers: auth });
    plans.push(...page.items);
    pCursor = page.nextCursor;
    if (plans.length > 1000) break;
  } while (pCursor);
  const plan = plans.find((p) => p.period === payout.period) ?? null;

  // Collect credits that fed this payout: same rep + same period.
  const credits: Credit[] = [];
  let cCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cCursor) qs.set("cursor", cCursor);
    const page = await invokeJson<CreditPage>(context, `/credits?${qs}`, { headers: auth });
    for (const c of page.items) {
      if (c.repEmail === payout.repEmail && c.period === payout.period) {
        credits.push(c);
      }
    }
    cCursor = page.nextCursor;
    if (credits.length > 5000) break;
  } while (cCursor);

  const creditBreakdown = credits.map((c) => {
    const credited = Math.round(c.amountCents * (c.splitPercent / 100));
    return {
      creditId: c.id,
      dealId: c.dealId,
      amountCents: c.amountCents,
      splitPercent: c.splitPercent,
      creditedCents: credited,
      dealStatus: c.dealStatus ?? null,
    };
  });
  const baseSum = creditBreakdown.reduce((s, c) => s + c.creditedCents, 0);

  // Reproduce the accelerator decision so we can name which tier triggered.
  const sortedAcc = plan ? [...plan.accelerators].sort((a, b) => b.threshold - a.threshold) : [];
  const tierApplied = sortedAcc.find((tier) => payout.attainmentPercent >= tier.threshold) ?? null;
  const baseRate = plan?.baseRate ?? null;
  const effectiveRate =
    tierApplied?.rate ?? (baseRate !== null ? baseRate : null);

  const expectedCommission =
    baseRate !== null && effectiveRate !== null
      ? Math.round(baseSum * effectiveRate)
      : null;

  return new Response(
    JSON.stringify({
      payout,
      plan,
      math: {
        creditBreakdown,
        baseAmountCents: baseSum,
        attainmentPercent: payout.attainmentPercent,
        baseRate,
        tierApplied,
        effectiveRate,
        accelerator: payout.accelerator,
        commissionCents: payout.commissionCents,
        recomputedCommissionCents: expectedCommission,
        matchesStored: expectedCommission !== null && expectedCommission === payout.commissionCents,
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
}
