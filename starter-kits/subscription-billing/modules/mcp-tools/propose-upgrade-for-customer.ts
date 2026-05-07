import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Plan, Subscription, UsageRecord } from "../repositories/subscriptions.ts";

/**
 * Orchestrator MCP tool: propose_upgrade_for_customer.
 *
 * Walks the customer's active subscriptions, sums recent usage, and if usage
 * has exceeded the current plan's `includedUsage`, suggests the next plan up
 * (cheapest plan whose includedUsage >= current usage).
 */

interface Body {
  customerId: string;
}

interface SubscriptionPage { items: Subscription[]; nextCursor: string | null }
interface PlanPage { items: Plan[]; nextCursor: string | null }
interface UsagePage { items: UsageRecord[]; nextCursor: string | null }

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.customerId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "customerId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
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
  const customerSubs = subs.filter((s) => s.customerId === body.customerId && s.status === "active");
  if (customerSubs.length === 0) {
    return new Response(
      JSON.stringify({ customerId: body.customerId, suggestions: [], reason: "no_active_subscriptions" }),
      { headers: { "content-type": "application/json" } },
    );
  }

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

  const usage: UsageRecord[] = [];
  let uCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (uCursor) qs.set("cursor", uCursor);
    const page = await invokeJson<UsagePage>(context, `/usage-records?${qs}`, { headers: auth });
    usage.push(...page.items);
    uCursor = page.nextCursor;
    if (usage.length > 100000) break;
  } while (uCursor);

  const suggestions: Array<{
    subscriptionId: string;
    currentPlan: Plan | null;
    currentPeriodUsage: number;
    suggestedPlan: Plan | null;
    overage: number;
  }> = [];

  for (const sub of customerSubs) {
    const currentPlan = planById.get(sub.planId) ?? null;
    const usageInPeriod = usage
      .filter((u) => u.subscriptionId === sub.id && u.periodStart === sub.currentPeriodStart && u.periodEnd === sub.currentPeriodEnd)
      .reduce((s, u) => s + u.quantity, 0);
    if (!currentPlan) {
      suggestions.push({ subscriptionId: sub.id, currentPlan: null, currentPeriodUsage: usageInPeriod, suggestedPlan: null, overage: 0 });
      continue;
    }
    const overage = Math.max(0, usageInPeriod - currentPlan.includedUsage);
    if (overage <= 0) {
      suggestions.push({ subscriptionId: sub.id, currentPlan, currentPeriodUsage: usageInPeriod, suggestedPlan: null, overage });
      continue;
    }
    // Find cheapest plan whose includedUsage covers current usage and price > current.
    const candidates = plans
      .filter((p) => p.includedUsage >= usageInPeriod && p.priceCents > currentPlan.priceCents)
      .sort((a, b) => a.priceCents - b.priceCents);
    suggestions.push({
      subscriptionId: sub.id,
      currentPlan,
      currentPeriodUsage: usageInPeriod,
      suggestedPlan: candidates[0] ?? null,
      overage,
    });
  }

  return new Response(
    JSON.stringify({
      customerId: body.customerId,
      suggestions,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
