import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Payout } from "../repositories/payouts.ts";
import type { CompPlan } from "../repositories/comp-plans.ts";
import type { Quota } from "../repositories/quotas.ts";

/**
 * Orchestrator MCP tool: model_what_if_close.
 *
 * Given a rep, a period, and a hypothetical additional credit amount,
 * computes what the rep's payout WOULD be if that extra credit landed.
 * Returns the existing payout (if any), the projected payout, and the
 * delta. No data is written.
 */

interface Body {
  repEmail: string;
  period: string;
  additionalCents: number;
}

interface PayoutPage {
  items: Payout[];
  nextCursor: string | null;
}

interface PlanPage {
  items: CompPlan[];
  nextCursor: string | null;
}

interface QuotaPage {
  items: Quota[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  // Find the rep's existing payout for the period (if calculate_payouts
  // already ran). We look it up via the list endpoint with filters.
  const qs = new URLSearchParams({
    limit: "200",
    period: body.period,
    repEmail: body.repEmail,
  });
  const payoutsPage = await invokeJson<PayoutPage>(context, `/payouts?${qs}`, {
    headers: auth,
  });
  const existing = payoutsPage.items[0] ?? null;

  // Find the comp plan for the period.
  const plans: CompPlan[] = [];
  let pCursor: string | null | undefined = undefined;
  do {
    const qsp = new URLSearchParams({ limit: "200" });
    if (pCursor) qsp.set("cursor", pCursor);
    const page = await invokeJson<PlanPage>(context, `/plans?${qsp}`, { headers: auth });
    plans.push(...page.items);
    pCursor = page.nextCursor;
    if (plans.length > 1000) break;
  } while (pCursor);
  const plan = plans.find((p) => p.period === body.period);
  if (!plan) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: `No comp plan for period ${body.period}` },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  // Find the rep's quota for the period.
  let quotaCents = 0;
  let qCursor: string | null | undefined = undefined;
  do {
    const qsq = new URLSearchParams({ limit: "200" });
    if (qCursor) qsq.set("cursor", qCursor);
    const page = await invokeJson<QuotaPage>(context, `/quotas?${qsq}`, { headers: auth });
    const match = page.items.find(
      (q) => q.repEmail === body.repEmail && q.period === body.period,
    );
    if (match) {
      quotaCents = match.quotaCents;
      break;
    }
    qCursor = page.nextCursor;
  } while (qCursor);

  const currentBase = existing?.baseAmountCents ?? 0;
  const projectedBase = currentBase + Math.max(0, body.additionalCents);

  const projectedAttainment =
    quotaCents > 0 ? Math.round((projectedBase / quotaCents) * 10000) / 100 : 0;

  const sortedAcc = [...plan.accelerators].sort((a, b) => b.threshold - a.threshold);
  let projectedRate = plan.baseRate;
  let projectedAccelerator = 1;
  for (const tier of sortedAcc) {
    if (projectedAttainment >= tier.threshold) {
      projectedRate = tier.rate;
      projectedAccelerator = tier.rate / plan.baseRate;
      break;
    }
  }
  const projectedCommissionCents = Math.round(projectedBase * projectedRate);

  return new Response(
    JSON.stringify({
      repEmail: body.repEmail,
      period: body.period,
      quotaCents,
      additionalCents: body.additionalCents,
      existing,
      projected: {
        baseAmountCents: projectedBase,
        attainmentPercent: projectedAttainment,
        rate: projectedRate,
        accelerator: projectedAccelerator,
        commissionCents: projectedCommissionCents,
      },
      delta: {
        baseAmountCents: projectedBase - currentBase,
        commissionCents: projectedCommissionCents - (existing?.commissionCents ?? 0),
        attainmentPointsChange:
          projectedAttainment - (existing?.attainmentPercent ?? 0),
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
}
