import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { topicRepository } from "../repositories/topics.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const categorySlug = url.searchParams.get("categorySlug");
  const status = url.searchParams.get("status");

  const page = await topicRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
  });

  let items = page.items;
  if (categorySlug) items = items.filter((t) => t.categorySlug === categorySlug);
  if (status) items = items.filter((t) => t.status === status);

  return new Response(JSON.stringify({ items, nextCursor: page.nextCursor }), {
    headers: { "content-type": "application/json" },
  });
}
