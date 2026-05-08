import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Account } from "../repositories/accounts.ts";
import type { HealthScore } from "../repositories/health-scores.ts";
import type { Signal } from "../repositories/signals.ts";
import { callClaude, parseClaudeJson } from "../integrations/claude.ts";
import {
  getStripeRevenueHealth,
  type RevenueHealth,
} from "../integrations/stripe.ts";
import { queryPostHogHogql } from "../integrations/posthog.ts";

interface Body {
  csmEmail?: string;
  daysAhead?: number;
  /**
   * When true, fold in Stripe revenue-health for accounts that have a
   * stripeCustomerId set in their `external` map. Skipped silently if
   * STRIPE_SECRET_KEY is not configured.
   */
  includeRevenueHealth?: boolean;
  /**
   * Optional HogQL query that returns rows of [account_distinct_id_prefix,
   * weekly_active_users] — used as a usage signal. Skipped silently if
   * POSTHOG_PERSONAL_API_KEY is not configured.
   */
  posthogUsageQuery?: string;
  /**
   * When true (default), pass the per-account context to Claude and ask
   * for a low/medium/high risk classification + reasoning.
   */
  classifyWithClaude?: boolean;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

interface AccountWithExternal extends Account {
  /** Common pattern: external ids stuffed in a freeform map. */
  external?: { stripeCustomerId?: string; posthogPrefix?: string };
}

interface ClaudeRiskJudgment {
  accountId: string;
  risk: "low" | "medium" | "high";
  reasoning: string;
}

/**
 * Orchestrator: predict_churn_risk (Claude-powered).
 *
 * Aggregates signals from three places:
 *   - The kit's own health scores + signal events (DB)
 *   - Stripe (read-only): outstanding invoices, cancelling subscriptions
 *   - PostHog (HogQL): a usage rollup query you supply
 *
 * Hands the merged context to Claude and asks for a per-account churn
 * risk verdict (low/medium/high) plus reasoning. The kit's "AI angle".
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const daysAhead = body.daysAhead ?? 90;
  const cutoff = new Date(Date.now() + daysAhead * 86400000).toISOString();

  // Fetch accounts in scope.
  const accountsQs = body.csmEmail
    ? `?csmEmail=${encodeURIComponent(body.csmEmail)}&limit=200`
    : `?limit=200`;
  const accountsPage = await invokeJson<Page<AccountWithExternal>>(
    context,
    `/accounts${accountsQs}`,
    { headers: { authorization: auth } },
  );

  // Optional PostHog usage rollup.
  let usageByPrefix: Record<string, number> = {};
  if (body.posthogUsageQuery && process.env.POSTHOG_PERSONAL_API_KEY) {
    try {
      const result = await queryPostHogHogql(body.posthogUsageQuery);
      for (const row of result.results) {
        const key = String(row[0] ?? "");
        const wau = Number(row[1] ?? 0);
        if (key) usageByPrefix[key] = wau;
      }
    } catch (err) {
      context.log.warn(
        `PostHog usage query failed: ${(err as Error).message}`,
      );
    }
  }

  type Aggregated = {
    account: AccountWithExternal;
    latestScore: HealthScore | null;
    highSignals: Signal[];
    revenue: RevenueHealth | null;
    weeklyActiveUsers: number | null;
    deterministicReasons: string[];
  };

  const aggregated: Aggregated[] = [];

  for (const account of accountsPage.items) {
    const scoresPage = await invokeJson<Page<HealthScore>>(
      context,
      `/health-scores?accountId=${encodeURIComponent(account.id)}&limit=1`,
      { headers: { authorization: auth } },
    );
    const latestScore = scoresPage.items[0] ?? null;

    const signalsPage = await invokeJson<Page<Signal>>(
      context,
      `/signals?accountId=${encodeURIComponent(account.id)}&severity=high&limit=20`,
      { headers: { authorization: auth } },
    );
    const highSignals = signalsPage.items;

    let revenue: RevenueHealth | null = null;
    if (
      body.includeRevenueHealth &&
      process.env.STRIPE_SECRET_KEY &&
      account.external?.stripeCustomerId
    ) {
      try {
        revenue = await getStripeRevenueHealth(
          account.external.stripeCustomerId,
        );
      } catch (err) {
        context.log.warn(
          `Stripe revenue lookup failed for ${account.id}: ${(err as Error).message}`,
        );
      }
    }

    const wau = account.external?.posthogPrefix
      ? (usageByPrefix[account.external.posthogPrefix] ?? null)
      : null;

    const reasons: string[] = [];
    if (latestScore?.tier === "red") reasons.push("red health tier");
    if (account.renewsAt < cutoff && highSignals.length > 0) {
      reasons.push(
        `renews within ${daysAhead}d with ${highSignals.length} high-severity signal(s)`,
      );
    }
    if (revenue?.pastDueInvoices && revenue.pastDueInvoices > 0) {
      reasons.push(`${revenue.pastDueInvoices} past-due invoice(s)`);
    }
    if (revenue?.hasCancellingSubscription) {
      reasons.push("subscription set to cancel at period end");
    }
    if (wau !== null && wau === 0) {
      reasons.push("zero weekly active users");
    }

    if (reasons.length > 0 || latestScore?.tier === "yellow") {
      aggregated.push({
        account,
        latestScore,
        highSignals,
        revenue,
        weeklyActiveUsers: wau,
        deterministicReasons: reasons,
      });
    }
  }

  // Optional: ask Claude for a structured classification.
  let claudeJudgments: ClaudeRiskJudgment[] = [];
  const wantClaude =
    body.classifyWithClaude !== false &&
    aggregated.length > 0 &&
    (process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_URL);

  if (wantClaude) {
    const sketch = aggregated.map((a) => ({
      accountId: a.account.id,
      name: a.account.name,
      segment: a.account.segment,
      arrCents: a.account.arrCents,
      renewsAt: a.account.renewsAt,
      healthTier: a.latestScore?.tier ?? null,
      healthValue: a.latestScore?.value ?? null,
      highSignalCount: a.highSignals.length,
      pastDueInvoices: a.revenue?.pastDueInvoices ?? null,
      outstandingCents: a.revenue?.outstandingAmountCents ?? null,
      cancellingSubscription: a.revenue?.hasCancellingSubscription ?? null,
      weeklyActiveUsers: a.weeklyActiveUsers,
      deterministicReasons: a.deterministicReasons,
    }));

    try {
      const claude = await callClaude({
        system:
          'You are a customer success analyst. For each account in the input array, classify churn risk as "low", "medium", or "high" and write one short sentence of reasoning grounded in the input. Respond with ONLY a JSON array, one object per account, shape: {accountId, risk, reasoning}. Do not include accounts that are clearly low risk and have no signals.',
        messages: [
          {
            role: "user",
            content: `Classify churn risk for these accounts:\n\n${JSON.stringify(sketch, null, 2)}`,
          },
        ],
        maxTokens: 2000,
      });
      try {
        claudeJudgments = parseClaudeJson<ClaudeRiskJudgment[]>(claude.text);
      } catch (err) {
        context.log.warn(
          `Claude returned non-JSON: ${(err as Error).message}`,
        );
      }
    } catch (err) {
      context.log.warn(`Claude classification failed: ${(err as Error).message}`);
    }
  }

  const judgmentByAccount = new Map(
    claudeJudgments.map((j) => [j.accountId, j]),
  );

  const atRisk = aggregated.map((a) => ({
    account: a.account,
    latestScore: a.latestScore,
    highSignals: a.highSignals,
    revenue: a.revenue,
    weeklyActiveUsers: a.weeklyActiveUsers,
    reasons: a.deterministicReasons,
    claudeRisk: judgmentByAccount.get(a.account.id)?.risk ?? null,
    claudeReasoning: judgmentByAccount.get(a.account.id)?.reasoning ?? null,
  }));

  return new Response(
    JSON.stringify({
      filter: { csmEmail: body.csmEmail ?? null, daysAhead },
      atRiskCount: atRisk.length,
      atRisk,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
