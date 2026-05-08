import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Answer, Response_ } from "../repositories/surveys.ts";
import { callClaude } from "../integrations/claude.ts";

/**
 * Orchestrator MCP tool: cluster_open_responses.
 *
 * Pulls every text answer to a single question and asks Claude to bucket
 * the responses into named themes with sample comments. If Claude is
 * unavailable (or `useClaude=false` is passed) the tool falls back to
 * keyword-frequency tokenization so the kit always returns *something*.
 */

interface Body {
  surveyId: string;
  questionId: string;
  topThemes?: number;
  samplesPerTheme?: number;
  /** Defaults true. When false, skip Claude and use the keyword fallback. */
  useClaude?: boolean;
}

interface ResponseDetail {
  response: Response_;
  answers: Answer[];
}

interface ResponsePage {
  items: Response_[];
  nextCursor: string | null;
}

interface Theme {
  keyword: string;
  count: number;
  samples: string[];
}

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","of","to","in","is","it","for","on","with","as",
  "this","that","at","by","be","are","was","were","i","you","we","our","my","your",
  "they","them","their","not","no","yes","so","if","than","then","do","does","did",
  "have","has","had","just","very","really","more","most","much","many","some","any",
  "from","about","because","just","also","too","one","two","three","into","over",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function tokenFallback(texts: string[], topThemes: number, samplesPerTheme: number): Theme[] {
  const counts = new Map<string, number>();
  const samplesByToken = new Map<string, string[]>();
  for (const t of texts) {
    const seen = new Set<string>();
    for (const tok of tokenize(t)) {
      if (seen.has(tok)) continue;
      seen.add(tok);
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
      if (!samplesByToken.has(tok)) samplesByToken.set(tok, []);
      const samples = samplesByToken.get(tok)!;
      if (samples.length < samplesPerTheme) samples.push(t);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topThemes)
    .map(([keyword, count]) => ({
      keyword,
      count,
      samples: samplesByToken.get(keyword) ?? [],
    }));
}

interface ClaudeTheme {
  name: string;
  description?: string;
  count: number;
  sampleIndexes: number[];
}

async function clusterWithClaude(
  texts: string[],
  topThemes: number,
  samplesPerTheme: number,
): Promise<Theme[]> {
  const numbered = texts
    .map((t, i) => `[${i}] ${t.replace(/\s+/g, " ").slice(0, 500)}`)
    .join("\n");
  const system = `You cluster open-text survey responses into themes.

Return STRICT JSON only — no prose, no markdown fences. Schema:
{ "themes": [ { "name": "<short label>", "description": "<one sentence>", "count": <int>, "sampleIndexes": [<int>, ...] } ] }

Rules:
- Produce at most ${topThemes} themes, ordered by count desc.
- For each theme, list at most ${samplesPerTheme} representative response indexes.
- Every theme.name is 1–4 words, lowercase, no punctuation.
- count is the number of distinct responses you'd assign to that theme.
- A response may belong to multiple themes; that's fine.`;
  const user = `Cluster these ${texts.length} responses:\n\n${numbered}`;

  const reply = await callClaude({
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 2048,
    temperature: 0,
  });

  // Strip optional code fences.
  const cleaned = reply.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const parsed = JSON.parse(cleaned) as { themes: ClaudeTheme[] };
  return (parsed.themes ?? []).slice(0, topThemes).map((t) => ({
    keyword: t.name,
    count: t.count,
    samples: (t.sampleIndexes ?? [])
      .filter((i): i is number => Number.isInteger(i) && i >= 0 && i < texts.length)
      .slice(0, samplesPerTheme)
      .map((i) => texts[i]),
  }));
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };
  const topThemes = Math.max(1, Math.min(20, body.topThemes ?? 5));
  const samplesPerTheme = Math.max(1, Math.min(10, body.samplesPerTheme ?? 3));

  // Collect every response for this survey, then fetch answers per response
  // to get the answer matching this question.
  const responses: Response_[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ResponsePage>(
      context,
      `/surveys/${body.surveyId}/responses?${qs}`,
      { headers: auth },
    );
    responses.push(...page.items);
    cursor = page.nextCursor;
    if (responses.length > 5000) break;
  } while (cursor);

  const texts: string[] = [];
  for (const r of responses) {
    const detail = await invokeJson<ResponseDetail>(context, `/responses/${r.id}`, {
      headers: auth,
    });
    const a = detail.answers.find((x) => x.questionId === body.questionId);
    if (a && typeof a.value === "string" && a.value.trim().length > 0) {
      texts.push(a.value);
    }
  }

  const useClaude = body.useClaude !== false;
  let themes: Theme[];
  let engine: "claude" | "fallback";
  let engineError: string | null = null;
  if (useClaude && texts.length > 0) {
    try {
      themes = await clusterWithClaude(texts, topThemes, samplesPerTheme);
      engine = "claude";
    } catch (err) {
      engineError = (err as Error).message;
      themes = tokenFallback(texts, topThemes, samplesPerTheme);
      engine = "fallback";
    }
  } else {
    themes = tokenFallback(texts, topThemes, samplesPerTheme);
    engine = "fallback";
  }

  return new Response(
    JSON.stringify({
      surveyId: body.surveyId,
      questionId: body.questionId,
      responseCount: texts.length,
      engine,
      engineError,
      themes,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
