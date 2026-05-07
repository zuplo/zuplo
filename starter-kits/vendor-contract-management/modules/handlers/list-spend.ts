import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { spendRecordRepository } from "../repositories/contracts.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const vendorId = url.searchParams.get("vendorId");
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const page = await spendRecordRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "periodStart", direction: "desc" },
  });

  const filtered = vendorId
    ? page.items.filter((r) => r.vendorId === vendorId)
    : page.items;

  return new Response(
    JSON.stringify({ items: filtered, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
