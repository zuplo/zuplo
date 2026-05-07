import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Account } from "../repositories/accounts.ts";
import type { HealthScore } from "../repositories/health-scores.ts";
import type { Signal } from "../repositories/signals.ts";

interface Body {
  csmEmail?: string;
  daysAhead?: number;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Orchestrator: predict_churn_risk.
 *
 * Returns accounts most likely to churn, defined as:
 *   tier === 'red' OR (renewsAt < N days AND any high-severity signal).
 * Filterable to a single CSM's book of business.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const daysAhead = body.daysAhead ?? 90;
  const cutoff = new Date(Date.now() + daysAhead * 86400000).toISOString();

  const accountsQs = body.csmEmail
    ? `?csmEmail=${encodeURIComponent(body.csmEmail)}&limit=200`
    : `?limit=200`;
  const accountsPage = await invokeJson<Page<Account>>(
    context,
    `/accounts${accountsQs}`,
    { headers: { authorization: auth } },
  );

  const at_risk: Array<{
    account: Account;
    latestScore: HealthScore | null;
    highSignals: Signal[];
    reasons: string[];
  }> = [];

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

    const reasons: string[] = [];
    if (latestScore?.tier === "red") reasons.push("red health tier");
    if (account.renewsAt < cutoff && highSignals.length > 0) {
      reasons.push(`renews within ${daysAhead}d with ${highSignals.length} high-severity signal(s)`);
    }
    if (reasons.length > 0) {
      at_risk.push({ account, latestScore, highSignals, reasons });
    }
  }

  return new Response(
    JSON.stringify({
      filter: { csmEmail: body.csmEmail ?? null, daysAhead },
      atRiskCount: at_risk.length,
      atRisk: at_risk,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
