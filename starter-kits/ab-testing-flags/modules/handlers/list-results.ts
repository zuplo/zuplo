import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { resultRepository } from "../repositories/experiments.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const experimentKey = url.searchParams.get("experimentKey");

  const page = await resultRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "computedAt", direction: "desc" },
  });

  const filtered = experimentKey
    ? page.items.filter((r) => r.experimentKey === experimentKey)
    : page.items;

  return new Response(
    JSON.stringify({ items: filtered, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
