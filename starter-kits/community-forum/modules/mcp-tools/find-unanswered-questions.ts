import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Topic } from "../repositories/topics.ts";

/**
 * Orchestrator MCP tool: find_unanswered_questions.
 *
 * Surfaces topics that look like questions (title ends in "?" or starts
 * with a question word) and have zero replies. Optionally filters by
 * minimum age in days so the queue doesn't include just-posted topics.
 */

interface Body {
  minAgeHours?: number;
  categorySlug?: string;
  limit?: number;
}

interface TopicPage {
  items: Topic[];
  nextCursor: string | null;
}

const QUESTION_PREFIXES = [
  "how",
  "what",
  "why",
  "when",
  "where",
  "who",
  "which",
  "is",
  "are",
  "can",
  "could",
  "should",
  "does",
  "do",
];

function looksLikeQuestion(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (t.endsWith("?")) return true;
  const firstWord = t.split(/\s+/)[0] ?? "";
  return QUESTION_PREFIXES.includes(firstWord);
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const minAgeHours = Math.max(0, body.minAgeHours ?? 24);
  const limit = Math.max(1, Math.min(200, body.limit ?? 50));
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const all: Topic[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    if (body.categorySlug) qs.set("categorySlug", body.categorySlug);
    const page = await invokeJson<TopicPage>(context, `/topics?${qs}`, { headers: auth });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 5000) break;
  } while (cursor);

  const cutoff = Date.now() - minAgeHours * 60 * 60 * 1000;
  const unanswered = all
    .filter((t) => t.status !== "archived" && t.status !== "closed")
    .filter((t) => t.replyCount === 0)
    .filter((t) => looksLikeQuestion(t.title))
    .filter((t) => new Date(t.createdAt).getTime() <= cutoff)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, limit);

  const now = Date.now();
  const items = unanswered.map((t) => ({
    topic: t,
    ageHours: Math.floor((now - new Date(t.createdAt).getTime()) / (1000 * 60 * 60)),
  }));

  return new Response(
    JSON.stringify({ count: items.length, items }),
    { headers: { "content-type": "application/json" } },
  );
}
