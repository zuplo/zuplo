import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Subscription } from "../repositories/subscriptions.ts";

/**
 * Orchestrator MCP tool: find_at_risk_subscriptions.
 *
 * Returns subscriptions that are past_due, have a cancellation pending, or
 * whose trial ends in <7 days. Each entry includes a `risks: string[]` to
 * help the LLM ground its outreach.
 */

interface SubscriptionPage { items: Subscription[]; nextCursor: string | null }

interface Risky {
  subscription: Subscription;
  risks: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
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

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  const at_risk: Risky[] = [];
  for (const sub of subs) {
    const risks: string[] = [];
    if (sub.status === "past_due") risks.push("past_due");
    if (sub.canceledAt) risks.push("cancellation_pending");
    if (sub.trialEnd) {
      const trialEndMs = new Date(sub.trialEnd).getTime();
      if (trialEndMs > now && trialEndMs - now < sevenDays) {
        risks.push("trial_ending_within_7d");
      }
    }
    if (risks.length > 0) at_risk.push({ subscription: sub, risks });
  }

  return new Response(
    JSON.stringify({
      count: at_risk.length,
      at_risk,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
