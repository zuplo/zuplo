import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { touchpointRepository } from "../repositories/touchpoints.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const visitorId = url.searchParams.get("visitorId");
  const channel = url.searchParams.get("channel");

  const page = await touchpointRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "occurredAt", direction: "desc" },
  });

  const filtered = page.items.filter((tp) => {
    if (visitorId && tp.visitorId !== visitorId) return false;
    if (channel && tp.channel !== channel) return false;
    return true;
  });

  return new Response(
    JSON.stringify({ items: filtered, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
