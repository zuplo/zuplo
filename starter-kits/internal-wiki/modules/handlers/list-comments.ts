import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { commentRepository } from "../repositories/comments.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const pageId = request.params.id;
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");

  const page = await commentRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    orderBy: { field: "postedAt", direction: "asc" },
  });

  const items = page.items.filter((c) => c.pageId === pageId);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
