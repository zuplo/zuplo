import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { IncidentTicket, KBArticle } from "../repositories/tickets.ts";

/**
 * Orchestrator: suggest_kb_answer.
 *
 * Reads a ticket, extracts keywords, calls /kb-articles/search, and ranks
 * articles by simple word-overlap. Returns the top matches an agent can paste
 * back to the requester.
 */

interface Body {
  ticketId: string;
  topN?: number;
}

interface KBSearchResult {
  items: KBArticle[];
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been",
  "have", "has", "had", "i", "you", "he", "she", "it", "we", "they", "for", "of",
  "to", "in", "on", "at", "with", "this", "that", "my", "our", "your",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.ticketId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "ticketId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const topN = Math.max(1, Math.min(10, body.topN ?? 3));
  const auth = request.headers.get("authorization") ?? "";

  const ticket = await invokeJson<IncidentTicket>(
    context,
    `/tickets/${encodeURIComponent(body.ticketId)}`,
    { headers: { authorization: auth } },
  );

  const keywords = extractKeywords(`${ticket.subject} ${ticket.body}`);
  const queryTerms = Array.from(new Set(keywords)).slice(0, 5);

  // Fan out to search-kb for each top keyword and merge.
  const articleScores = new Map<string, { article: KBArticle; score: number }>();
  for (const term of queryTerms) {
    const result = await invokeJson<KBSearchResult>(
      context,
      `/kb-articles/search?q=${encodeURIComponent(term)}`,
      { headers: { authorization: auth } },
    );
    for (const article of result.items) {
      const existing = articleScores.get(article.id);
      if (existing) {
        existing.score += 1;
      } else {
        articleScores.set(article.id, { article, score: 1 });
      }
    }
  }

  const ranked = Array.from(articleScores.values())
    .sort((a, b) => b.score - a.score || b.article.helpfulCount - a.article.helpfulCount)
    .slice(0, topN)
    .map((entry) => ({ ...entry.article, matchScore: entry.score }));

  return new Response(
    JSON.stringify({
      ticketId: ticket.id,
      queryTerms,
      suggestions: ranked,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
