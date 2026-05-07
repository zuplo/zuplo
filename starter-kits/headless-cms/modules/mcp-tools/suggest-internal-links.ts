import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Entry } from "../repositories/entries.ts";

/**
 * Orchestrator MCP tool: suggest_internal_links.
 *
 * Reads the source entry, extracts keywords from its title, then scans
 * other published entries in the same content type and returns the top
 * candidates that share keywords. A simple heuristic — production forks
 * would replace it with a vector store.
 */

interface Body {
  entryId: string;
  maxResults?: number;
}

interface EntryPage {
  items: Entry[];
  nextCursor: string | null;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "for", "with", "to", "of", "in",
  "on", "at", "by", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "this", "that", "these", "those", "it",
]);

function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w)),
  );
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.entryId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "entryId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const maxResults = Math.max(1, Math.min(50, body.maxResults ?? 10));
  const auth = request.headers.get("authorization") ?? "";

  const source = await invokeJson<Entry>(context, `/entries/${body.entryId}`, {
    headers: { authorization: auth },
  });
  const sourceKeywords = extractKeywords(`${source.title} ${source.excerpt}`);

  const candidates: Array<{ entry: Entry; sharedKeywords: string[]; score: number }> = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      status: "published",
      contentTypeSlug: source.contentTypeSlug,
    });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<EntryPage>(context, `/entries?${qs}`, {
      headers: { authorization: auth },
    });
    for (const entry of page.items) {
      if (entry.id === source.id) continue;
      if (entry.locale !== source.locale) continue;
      const candidateKeywords = extractKeywords(`${entry.title} ${entry.excerpt}`);
      const shared: string[] = [];
      for (const kw of candidateKeywords) {
        if (sourceKeywords.has(kw)) shared.push(kw);
      }
      if (shared.length > 0) {
        candidates.push({ entry, sharedKeywords: shared, score: shared.length });
      }
    }
    cursor = page.nextCursor;
    if (candidates.length > 500) break;
  } while (cursor);

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, maxResults).map((c) => ({
    entryId: c.entry.id,
    title: c.entry.title,
    slug: c.entry.slug,
    sharedKeywords: c.sharedKeywords,
    score: c.score,
  }));

  return new Response(
    JSON.stringify({
      sourceEntryId: source.id,
      sourceTitle: source.title,
      candidateCount: top.length,
      candidates: top,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
