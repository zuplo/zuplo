import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Response_ } from "../repositories/responses.ts";

interface Body {
  surveyId: string;
  daysBack?: number;
  themes?: Array<{ name: string; keywords: string[] }>;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Orchestrator: cluster_open_responses.
 *
 * Groups recent responses for a survey by simple keyword themes. Each
 * theme is a name plus a keyword list — a comment is bucketed into a
 * theme if any keyword appears (case-insensitive) in `comment`. Comments
 * with no theme match land in `unmatched`.
 */
const DEFAULT_THEMES: Array<{ name: string; keywords: string[] }> = [
  { name: "pricing", keywords: ["price", "expensive", "cost", "billing", "plan"] },
  { name: "support", keywords: ["support", "ticket", "response time", "agent", "help"] },
  { name: "performance", keywords: ["slow", "fast", "lag", "perf", "speed"] },
  { name: "ux", keywords: ["confusing", "ux", "ui", "design", "intuitive"] },
  { name: "missing_feature", keywords: ["missing", "wish", "would love", "lacking"] },
];

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const daysBack = body.daysBack ?? 30;
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString();
  const themes = body.themes ?? DEFAULT_THEMES;

  const all: Response_[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", surveyId: body.surveyId });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<Page<Response_>>(context, `/responses?${qs}`, {
      headers: { authorization: auth },
    });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 5000) break;
  } while (cursor);

  const recent = all.filter((r) => r.respondedAt >= cutoff);
  const buckets: Record<string, { count: number; samples: Response_[] }> = {};
  const unmatched: Response_[] = [];
  for (const t of themes) buckets[t.name] = { count: 0, samples: [] };

  for (const r of recent) {
    const lower = r.comment.toLowerCase();
    let matched = false;
    for (const theme of themes) {
      if (theme.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
        const b = buckets[theme.name];
        b.count += 1;
        if (b.samples.length < 5) b.samples.push(r);
        matched = true;
      }
    }
    if (!matched) unmatched.push(r);
  }

  const top = Object.entries(buckets)
    .map(([name, b]) => ({ theme: name, count: b.count, samples: b.samples }))
    .sort((a, b) => b.count - a.count);

  return new Response(
    JSON.stringify({
      surveyId: body.surveyId,
      daysBack,
      totalResponses: recent.length,
      topThemes: top,
      unmatchedCount: unmatched.length,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
