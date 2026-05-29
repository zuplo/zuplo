import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { payoutRepository } from "../repositories/payouts.ts";
import { compPlanRepository } from "../repositories/comp-plans.ts";
import { quotaRepository } from "../repositories/quotas.ts";
import { creditRepository } from "../repositories/credits.ts";

interface Body {
  period: string;
  planId: string;
}

/**
 * Calculate draft payouts for every rep with credits in the requested
 * period. Walks credits, sums by rep, applies the comp plan's base rate
 * and accelerator tiers based on attainment vs. quota.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const plan = await compPlanRepository.get(tenantId, body.planId);
  if (!plan) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Comp plan not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  // Sum credits per rep in the period.
  const creditByRep = new Map<string, number>();
  let cursor: string | null | undefined;
  do {
    const page = await creditRepository.list(tenantId, { limit: 200, cursor });
    for (const c of page.items) {
      if (c.period !== body.period) continue;
      const credited = Math.round(c.amountCents * (c.splitPercent / 100));
      creditByRep.set(c.repEmail, (creditByRep.get(c.repEmail) ?? 0) + credited);
    }
    cursor = page.nextCursor;
  } while (cursor);

  // Quotas keyed by rep+period.
  const quotaByRep = new Map<string, number>();
  let qcursor: string | null | undefined;
  do {
    const page = await quotaRepository.list(tenantId, { limit: 200, cursor: qcursor });
    for (const q of page.items) {
      if (q.period !== body.period) continue;
      quotaByRep.set(q.repEmail, q.quotaCents);
    }
    qcursor = page.nextCursor;
  } while (qcursor);

  const sortedAcc = [...plan.accelerators].sort((a, b) => b.threshold - a.threshold);

  const created: typeof body.period extends string ? unknown[] : never = [];
  const results: Array<{ repEmail: string; payoutId: string; commissionCents: number; attainmentPercent: number }> = [];

  for (const [repEmail, base] of creditByRep) {
    const quota = quotaByRep.get(repEmail) ?? 0;
    const attainmentPercent = quota > 0 ? Math.round((base / quota) * 10000) / 100 : 0;
    let rate = plan.baseRate;
    let accelerator = 1;
    for (const tier of sortedAcc) {
      if (attainmentPercent >= tier.threshold) {
        rate = tier.rate;
        accelerator = tier.rate / plan.baseRate;
        break;
      }
    }
    const commissionCents = Math.round(base * rate);
    const payout = await payoutRepository.create(tenantId, {
      repEmail,
      period: body.period,
      commissionCents,
      baseAmountCents: base,
      accelerator,
      attainmentPercent,
      status: "draft",
      paidAt: null,
    });
    results.push({
      repEmail,
      payoutId: payout.id,
      commissionCents,
      attainmentPercent,
    });
  }

  return new Response(JSON.stringify({ period: body.period, payoutCount: results.length, results }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
