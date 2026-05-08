import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { IncidentTicket, KBArticle } from "../repositories/tickets.ts";
import { callClaudeJson } from "../integrations/claude.ts";

/**
 * Orchestrator: suggest_kb_answer.
 *
 * Hybrid retrieval: keyword-search hits the KB, then Claude reads the
 * candidates and picks the best matches plus drafts a 1-2 sentence answer the
 * agent can paste back to the requester.
 */

interface Body {
  ticketId: string;
  topN?: number;
}

interface KBSearchResult {
  items: KBArticle[];
}

interface ClaudeRanking {
  bestArticleIds: string[];
  draftAnswer: string;
  confidence: "low" | "medium" | "high";
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

const SYSTEM_PROMPT = `You are an IT helpdesk knowledge agent. Given a ticket and a list of candidate KB articles, pick the 1-3 articles that actually answer the ticket and draft a short response the agent can paste back to the requester.

Be honest about confidence. If none of the articles really answer the question, return empty bestArticleIds and confidence: "low".`;

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

  // 1. Keyword retrieval — collect KB candidates from the search endpoint.
  const keywords = extractKeywords(`${ticket.subject} ${ticket.body}`);
  const queryTerms = Array.from(new Set(keywords)).slice(0, 5);
  const candidates = new Map<string, KBArticle>();
  for (const term of queryTerms) {
    const result = await invokeJson<KBSearchResult>(
      context,
      `/kb-articles/search?q=${encodeURIComponent(term)}`,
      { headers: { authorization: auth } },
    );
    for (const article of result.items) candidates.set(article.id, article);
  }

  if (candidates.size === 0) {
    return new Response(
      JSON.stringify({
        ticketId: ticket.id,
        queryTerms,
        suggestions: [],
        draftAnswer: null,
        confidence: "low",
      }),
      { headers: { "content-type": "application/json" } },
    );
  }

  // 2. Claude re-ranks + drafts.
  const candidateList = Array.from(candidates.values()).slice(0, 10);
  const ranking = await callClaudeJson<ClaudeRanking>({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          `Ticket subject: ${ticket.subject}`,
          `Ticket body: ${ticket.body}`,
          "",
          "Candidate KB articles:",
          ...candidateList.map(
            (a) => `- id=${a.id} | title=${a.title}\n  body: ${a.body.slice(0, 600)}`,
          ),
        ].join("\n"),
      },
    ],
    maxTokens: 1024,
    jsonSchemaHint: `{
  "bestArticleIds": ["string"],
  "draftAnswer": "string",
  "confidence": "low|medium|high"
}`,
  });

  const suggestions = ranking.bestArticleIds
    .map((id) => candidates.get(id))
    .filter((a): a is KBArticle => Boolean(a))
    .slice(0, topN);

  return new Response(
    JSON.stringify({
      ticketId: ticket.id,
      queryTerms,
      suggestions,
      draftAnswer: ranking.draftAnswer,
      confidence: ranking.confidence,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
