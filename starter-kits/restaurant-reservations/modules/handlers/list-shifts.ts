import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { shiftRepository } from "../repositories/shifts.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const page = await shiftRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "startsAt", direction: "asc" },
  });

  let items = page.items;
  if (from) items = items.filter((s) => s.startsAt >= from);
  if (to) items = items.filter((s) => s.startsAt < to);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
