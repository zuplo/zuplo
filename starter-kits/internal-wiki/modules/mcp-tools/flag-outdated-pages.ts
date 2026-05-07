import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { pageRepository, type Page } from "../repositories/pages.ts";

/**
 * Orchestrator MCP tool: flag_outdated_pages.
 *
 * Returns published pages whose lastEditedAt is older than the cutoff. Useful
 * for the LLM to surface "what needs a refresh?" — especially in fast-moving
 * spaces. The optional `spaceSlug` filter narrows to a specific space.
 */

interface Body {
  olderThanDays?: number;
  spaceSlug?: string;
  topN?: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json().catch(() => ({}))) as Body;
  const olderThanDays = body.olderThanDays ?? 90;
  const topN = Math.max(1, Math.min(100, body.topN ?? 25));
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  const all: Page[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const page = await pageRepository.list(tenantId, {
      limit: 200,
      cursor: cursor ?? undefined,
      orderBy: { field: "lastEditedAt", direction: "asc" },
    });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 5000) break;
  } while (cursor);

  const stale = all.filter(
    (p) =>
      p.status === "published" &&
      new Date(p.lastEditedAt).getTime() < cutoff &&
      (!body.spaceSlug || p.spaceSlug === body.spaceSlug),
  );

  // Sort oldest first — those need refresh the most.
  stale.sort(
    (a, b) =>
      new Date(a.lastEditedAt).getTime() - new Date(b.lastEditedAt).getTime(),
  );

  return new Response(
    JSON.stringify({
      olderThanDays,
      spaceSlug: body.spaceSlug ?? null,
      stalePageCount: stale.length,
      pages: stale.slice(0, topN),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
