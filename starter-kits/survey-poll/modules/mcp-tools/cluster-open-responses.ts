import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Answer, Response_ } from "../repositories/surveys.ts";

/**
 * Orchestrator MCP tool: cluster_open_responses.
 *
 * Pulls every text answer to a single question, splits each into lowercase
 * tokens, counts the most common stems, and returns the top themes with
 * sample comments. The LLM caller can refine, label, or rewrite themes.
 */

interface Body {
  surveyId: string;
  questionId: string;
  topThemes?: number;
  samplesPerTheme?: number;
}

interface ResponseDetail {
  response: Response_;
  answers: Answer[];
}

interface ResponsePage {
  items: Response_[];
  nextCursor: string | null;
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

  // Tally token frequency.
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

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topThemes);
  const themes = sorted.map(([token, count]) => ({
    keyword: token,
    count,
    samples: samplesByToken.get(token) ?? [],
  }));

  return new Response(
    JSON.stringify({
      surveyId: body.surveyId,
      questionId: body.questionId,
      responseCount: texts.length,
      themes,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
