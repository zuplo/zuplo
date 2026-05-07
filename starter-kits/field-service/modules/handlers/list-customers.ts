import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { customerRepository } from "../repositories/customers.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const q = url.searchParams.get("q");

  const page = await customerRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "name", direction: "asc" },
  });

  let items = page.items;
  if (q) {
    const needle = q.toLowerCase();
    items = items.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        (c.email ?? "").toLowerCase().includes(needle),
    );
  }

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
