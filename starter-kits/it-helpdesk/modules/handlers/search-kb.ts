import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { kbArticleRepository, type KBArticle } from "../repositories/tickets.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();

  if (!q) {
    return new Response(JSON.stringify({ items: [] }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Full scan over the tenant; for production replace with a search index.
  const results: KBArticle[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await kbArticleRepository.list(tenantId, {
      limit: 200,
      cursor: cursor ?? undefined,
      orderBy: { field: "lastUpdatedAt", direction: "desc" },
    });
    for (const article of page.items) {
      const haystack = `${article.title} ${article.body} ${article.tags.join(" ")}`.toLowerCase();
      if (haystack.includes(q)) results.push(article);
    }
    cursor = page.nextCursor;
    if (results.length > 100) break;
  } while (cursor);

  return new Response(JSON.stringify({ items: results }), {
    headers: { "content-type": "application/json" },
  });
}
