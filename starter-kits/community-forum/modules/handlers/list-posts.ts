import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { postRepository } from "../repositories/posts.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const topicId = url.searchParams.get("topicId");

  const page = await postRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
  });

  let items = page.items;
  if (topicId) items = items.filter((p) => p.topicId === topicId);

  return new Response(JSON.stringify({ items, nextCursor: page.nextCursor }), {
    headers: { "content-type": "application/json" },
  });
}
