import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Account } from "../repositories/accounts.ts";
import type { HealthScore } from "../repositories/health-scores.ts";
import type { Signal } from "../repositories/signals.ts";
import type { PlaybookRun } from "../repositories/playbook-runs.ts";

interface Body {
  accountId: string;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Orchestrator: summarize_account_health.
 *
 * Pulls the account, the latest health score, open signals (severity ordered),
 * and active playbook runs so the LLM can write a one-paragraph CSM briefing
 * without making half a dozen calls itself.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";

  const account = await invokeJson<Account>(
    context,
    `/accounts/${body.accountId}`,
    { headers: { authorization: auth } },
  );

  const scoresPage = await invokeJson<Page<HealthScore>>(
    context,
    `/health-scores?accountId=${encodeURIComponent(body.accountId)}&limit=1`,
    { headers: { authorization: auth } },
  );
  const latestScore = scoresPage.items[0] ?? null;

  const signalsPage = await invokeJson<Page<Signal>>(
    context,
    `/signals?accountId=${encodeURIComponent(body.accountId)}&limit=50`,
    { headers: { authorization: auth } },
  );
  const severityRank = { high: 3, med: 2, low: 1 } as const;
  const openSignals = [...signalsPage.items].sort(
    (a, b) => severityRank[b.severity] - severityRank[a.severity],
  );

  const runsPage = await invokeJson<Page<PlaybookRun>>(
    context,
    `/playbook-runs?accountId=${encodeURIComponent(body.accountId)}&status=active&limit=50`,
    { headers: { authorization: auth } },
  );
  const activeRuns = runsPage.items.filter(
    (r) => r.accountId === body.accountId && r.status === "active",
  );

  const daysToRenewal = Math.ceil(
    (new Date(account.renewsAt).getTime() - Date.now()) / 86400000,
  );

  return new Response(
    JSON.stringify({
      account,
      latestScore,
      tier: latestScore?.tier ?? null,
      daysToRenewal,
      openSignals: openSignals.slice(0, 10),
      activeRuns,
      narrative: buildNarrative(account, latestScore, openSignals, activeRuns, daysToRenewal),
    }),
    { headers: { "content-type": "application/json" } },
  );
}

function buildNarrative(
  account: Account,
  score: HealthScore | null,
  signals: Signal[],
  runs: PlaybookRun[],
  daysToRenewal: number,
): string {
  const tierText = score ? `${score.tier} (${score.scoreValue})` : "no score";
  const sigText = signals.length > 0 ? `${signals.length} open signals` : "no open signals";
  const runText = runs.length > 0 ? `${runs.length} active playbook(s)` : "no active playbooks";
  return `${account.name} (${account.segment}) renews in ${daysToRenewal} days. Health: ${tierText}. ${sigText}. ${runText}.`;
}
