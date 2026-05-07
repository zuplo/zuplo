import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { pageRepository, type Page } from "../repositories/pages.ts";

/**
 * Orchestrator MCP tool: find_canonical_page_for_topic.
 *
 * Finds the most-likely-canonical wiki page for a topic by scanning every
 * published page in the tenant for keyword matches in the title and body,
 * scoring by viewCount + recency. Returns the top matches so an LLM can
 * link to the right page instead of inventing one.
 */

interface Body {
  keywords: string[];
  topN?: number;
}

interface Match {
  page: Page;
  score: number;
  matchedKeywords: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!Array.isArray(body.keywords) || body.keywords.length === 0) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "keywords must be a non-empty array",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const topN = Math.max(1, Math.min(20, body.topN ?? 5));
  const lowerKeywords = body.keywords.map((k) => k.toLowerCase());

  const all: Page[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const page = await pageRepository.list(tenantId, {
      limit: 200,
      cursor: cursor ?? undefined,
      orderBy: { field: "lastEditedAt", direction: "desc" },
    });
    for (const p of page.items) {
      if (p.status === "published") all.push(p);
    }
    cursor = page.nextCursor;
    if (all.length > 5000) break;
  } while (cursor);

  const now = Date.now();
  const matches: Match[] = [];
  for (const p of all) {
    const title = p.title.toLowerCase();
    const bod = p.body.toLowerCase();
    const matched: string[] = [];
    let titleHits = 0;
    let bodyHits = 0;
    for (const kw of lowerKeywords) {
      if (title.includes(kw)) {
        matched.push(kw);
        titleHits += 1;
      } else if (bod.includes(kw)) {
        matched.push(kw);
        bodyHits += 1;
      }
    }
    if (matched.length === 0) continue;
    const ageDays = Math.max(
      0,
      (now - new Date(p.lastEditedAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    const recencyBoost = Math.max(0, 30 - ageDays) / 30;
    const viewBoost = Math.log10(1 + p.viewCount);
    const score =
      titleHits * 5 + bodyHits * 1 + recencyBoost * 2 + viewBoost * 1;
    matches.push({ page: p, score, matchedKeywords: matched });
  }

  matches.sort((a, b) => b.score - a.score);

  return new Response(
    JSON.stringify({
      keywords: body.keywords,
      totalMatches: matches.length,
      results: matches.slice(0, topN),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
