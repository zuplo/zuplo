import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { onCallRepository } from "../repositories/incidents.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const rotationName = url.searchParams.get("rotationName");
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const page = await onCallRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "startsAt", direction: "asc" },
  });

  const filtered = rotationName
    ? page.items.filter((o) => o.rotationName === rotationName)
    : page.items;

  return new Response(
    JSON.stringify({ items: filtered, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
