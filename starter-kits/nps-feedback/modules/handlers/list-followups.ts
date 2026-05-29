import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { followUpRepository } from "../repositories/follow-ups.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const responseId = url.searchParams.get("responseId") ?? undefined;
  const byEmail = url.searchParams.get("byEmail") ?? undefined;

  const page = await followUpRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "sentAt", direction: "desc" },
  });

  const items = page.items.filter((f) => {
    if (responseId && f.responseId !== responseId) return false;
    if (byEmail && f.byEmail !== byEmail) return false;
    return true;
  });

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
