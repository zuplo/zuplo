import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Response_ } from "../repositories/responses.ts";
import { callClaude, parseClaudeJson } from "../integrations/claude.ts";

interface Body {
  surveyId: string;
  daysBack?: number;
  /**
   * When false, fall back to the keyword-only clustering. Default true:
   * use Claude to discover themes and bucket responses.
   */
  useClaude?: boolean;
  /** Optional caller-supplied keyword themes (used as fallback). */
  themes?: Array<{ name: string; keywords: string[] }>;
  /** Cap on responses sent to Claude. Default 200; tune for cost. */
  maxResponsesForClaude?: number;
  /** Hint Claude on how many themes to extract. Default 6. */
  maxThemes?: number;
  /** Filter to a verbatim category before clustering. */
  category?: "promoter" | "passive" | "detractor";
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

interface ClaudeTheme {
  theme: string;
  count: number;
  /** 1-2 sentence summary of the theme. */
  summary: string;
  /** Verbatim ids that contributed to the theme. */
  responseIds: string[];
}

interface ClaudeClusterResult {
  themes: ClaudeTheme[];
  unmatchedResponseIds: string[];
}

const DEFAULT_THEMES: Array<{ name: string; keywords: string[] }> = [
  { name: "pricing", keywords: ["price", "expensive", "cost", "billing", "plan"] },
  { name: "support", keywords: ["support", "ticket", "response time", "agent", "help"] },
  { name: "performance", keywords: ["slow", "fast", "lag", "perf", "speed"] },
  { name: "ux", keywords: ["confusing", "ux", "ui", "design", "intuitive"] },
  { name: "missing_feature", keywords: ["missing", "wish", "would love", "lacking"] },
];

/**
 * Orchestrator: cluster_open_responses (Claude-powered).
 *
 * Pulls recent open-ended verbatims for a survey and asks Claude to
 * cluster them into themes. Returns each theme with a count, a short
 * summary, and the contributing response ids — exactly what a CX team
 * needs for a weekly verbatim review.
 *
 * Falls back to a keyword-list clustering when Claude is unavailable.
 * This is the kit's "AI angle".
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const daysBack = body.daysBack ?? 30;
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString();

  const all: Response_[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", surveyId: body.surveyId });
    if (cursor) qs.set("cursor", cursor);
    if (body.category) qs.set("category", body.category);
    const page = await invokeJson<Page<Response_>>(context, `/responses?${qs}`, {
      headers: { authorization: auth },
    });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 5000) break;
  } while (cursor);

  const recent = all.filter(
    (r) => r.respondedAt >= cutoff && r.comment && r.comment.length > 0,
  );

  const wantClaude =
    body.useClaude !== false &&
    (process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_URL);

  // --- Path 1: Claude clustering ---
  if (wantClaude && recent.length > 0) {
    const cap = Math.max(1, Math.min(500, body.maxResponsesForClaude ?? 200));
    const sample = recent.slice(0, cap).map((r) => ({
      id: r.id,
      score: r.score,
      segment: r.segment ?? null,
      comment: r.comment.slice(0, 600),
    }));
    const maxThemes = Math.max(2, Math.min(20, body.maxThemes ?? 6));

    try {
      const claude = await callClaude({
        system: `You are a CX research analyst. Read the survey verbatims and group them into at most ${maxThemes} themes. Each theme is a short noun phrase. For each theme include a 1-2 sentence summary and the response ids that fall in that theme. Respond with ONLY a JSON object of shape {"themes":[{"theme":"...","count":N,"summary":"...","responseIds":["..."]}],"unmatchedResponseIds":["..."]}. Sort themes by count descending.`,
        messages: [
          {
            role: "user",
            content: `Cluster these ${sample.length} responses for survey ${body.surveyId}:\n\n${JSON.stringify(sample, null, 2)}`,
          },
        ],
        maxTokens: 3000,
      });
      const parsed = parseClaudeJson<ClaudeClusterResult>(claude.text);
      // Stitch in actual response objects so callers get verbatims.
      const byId = new Map(recent.map((r) => [r.id, r]));
      const themesWithSamples = parsed.themes.map((t) => ({
        theme: t.theme,
        count: t.count,
        summary: t.summary,
        samples: t.responseIds
          .map((rid) => byId.get(rid))
          .filter((r): r is Response_ => !!r)
          .slice(0, 5),
      }));
      return new Response(
        JSON.stringify({
          surveyId: body.surveyId,
          daysBack,
          totalResponses: recent.length,
          mode: "claude",
          topThemes: themesWithSamples,
          unmatchedCount: parsed.unmatchedResponseIds.length,
        }),
        { headers: { "content-type": "application/json" } },
      );
    } catch (err) {
      context.log.warn(
        `Claude clustering failed, falling back to keyword: ${(err as Error).message}`,
      );
    }
  }

  // --- Path 2: keyword fallback ---
  const themes = body.themes ?? DEFAULT_THEMES;
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
      mode: "keyword",
      topThemes: top,
      unmatchedCount: unmatched.length,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
