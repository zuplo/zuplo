import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Plan, Subscription } from "../repositories/subscriptions.ts";

/**
 * Orchestrator MCP tool: forecast_mrr.
 *
 * Sums active subscriptions × plan price normalized to monthly. `asOf` is
 * informational; this implementation uses the current state of subscriptions.
 */

interface Body {
  asOf?: string;
}

interface SubscriptionPage { items: Subscription[]; nextCursor: string | null }
interface PlanPage { items: Plan[]; nextCursor: string | null }

function monthlyCents(plan: Plan): number {
  return plan.intervalUnit === "year" ? Math.round(plan.priceCents / 12) : plan.priceCents;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const subs: Subscription[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<SubscriptionPage>(context, `/subscriptions?${qs}`, { headers: auth });
    subs.push(...page.items);
    cursor = page.nextCursor;
    if (subs.length > 50000) break;
  } while (cursor);

  const plans: Plan[] = [];
  let pCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (pCursor) qs.set("cursor", pCursor);
    const page = await invokeJson<PlanPage>(context, `/plans?${qs}`, { headers: auth });
    plans.push(...page.items);
    pCursor = page.nextCursor;
    if (plans.length > 5000) break;
  } while (pCursor);
  const planById = new Map(plans.map((p) => [p.id, p]));

  let mrrCents = 0;
  let activeCount = 0;
  const byPlan: Record<string, { planName: string; activeCount: number; mrrCents: number }> = {};

  for (const sub of subs) {
    if (sub.status !== "active") continue;
    const plan = planById.get(sub.planId);
    if (!plan) continue;
    const m = monthlyCents(plan);
    mrrCents += m;
    activeCount += 1;
    const bucket = (byPlan[plan.id] ??= { planName: plan.name, activeCount: 0, mrrCents: 0 });
    bucket.activeCount += 1;
    bucket.mrrCents += m;
  }

  return new Response(
    JSON.stringify({
      asOf: body.asOf ?? new Date().toISOString(),
      activeSubscriptionCount: activeCount,
      mrrCents,
      arrCents: mrrCents * 12,
      byPlan,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
