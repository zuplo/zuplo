import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { healthScoreRepository } from "../repositories/health-scores.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const accountId = url.searchParams.get("accountId") ?? undefined;
  const tier = url.searchParams.get("tier") ?? undefined;

  const page = await healthScoreRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "computedAt", direction: "desc" },
  });

  const items = page.items.filter((s) => {
    if (accountId && s.accountId !== accountId) return false;
    if (tier && s.tier !== tier) return false;
    return true;
  });

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
