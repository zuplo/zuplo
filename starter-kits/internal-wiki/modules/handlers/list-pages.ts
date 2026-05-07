import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { pageRepository } from "../repositories/pages.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const spaceSlug = url.searchParams.get("spaceSlug");
  const status = url.searchParams.get("status");

  const page = await pageRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "lastEditedAt", direction: "desc" },
  });

  let items = page.items;
  if (spaceSlug) items = items.filter((p) => p.spaceSlug === spaceSlug);
  if (status) items = items.filter((p) => p.status === status);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
