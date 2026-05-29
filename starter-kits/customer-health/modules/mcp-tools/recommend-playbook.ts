import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Signal } from "../repositories/signals.ts";
import type { Playbook } from "../repositories/playbooks.ts";
import type { PlaybookRun } from "../repositories/playbook-runs.ts";

interface Body {
  accountId: string;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

const SEVERITY_RANK = { low: 1, med: 2, high: 3 } as const;

/**
 * Orchestrator: recommend_playbook.
 *
 * Looks at active signals on an account and finds matching playbooks (by
 * trigger.signalKind + trigger.minSeverity) that aren't already running.
 * Returns the top suggestion plus all candidates so the LLM can present
 * options.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";

  const signalsPage = await invokeJson<Page<Signal>>(
    context,
    `/signals?accountId=${encodeURIComponent(body.accountId)}&limit=100`,
    { headers: { authorization: auth } },
  );
  const playbooksPage = await invokeJson<Page<Playbook>>(
    context,
    `/playbooks?limit=200`,
    { headers: { authorization: auth } },
  );
  const runsPage = await invokeJson<Page<PlaybookRun>>(
    context,
    `/playbook-runs?accountId=${encodeURIComponent(body.accountId)}&status=active&limit=200`,
    { headers: { authorization: auth } },
  );

  const activePlaybookIds = new Set(
    runsPage.items
      .filter((r) => r.accountId === body.accountId && r.status === "active")
      .map((r) => r.playbookId),
  );

  const candidates: Array<{ playbook: Playbook; matchedSignal: Signal; rank: number }> = [];
  for (const playbook of playbooksPage.items) {
    if (activePlaybookIds.has(playbook.id)) continue;
    const minRank = SEVERITY_RANK[playbook.trigger.minSeverity];
    const matched = signalsPage.items.find(
      (s) =>
        s.kind === playbook.trigger.signalKind &&
        SEVERITY_RANK[s.severity] >= minRank,
    );
    if (matched) {
      candidates.push({
        playbook,
        matchedSignal: matched,
        rank: SEVERITY_RANK[matched.severity],
      });
    }
  }

  candidates.sort((a, b) => b.rank - a.rank);
  const top = candidates[0] ?? null;

  return new Response(
    JSON.stringify({
      accountId: body.accountId,
      topRecommendation: top,
      candidates,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
