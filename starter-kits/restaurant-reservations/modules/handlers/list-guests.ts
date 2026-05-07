import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { guestRepository } from "../repositories/guests.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const vip = url.searchParams.get("vip");
  const q = url.searchParams.get("q");

  const page = await guestRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "lastName", direction: "asc" },
  });

  let items = page.items;
  if (vip === "true") items = items.filter((g) => g.vip === true);
  if (vip === "false") items = items.filter((g) => g.vip === false);
  if (q) {
    const needle = q.toLowerCase();
    items = items.filter(
      (g) =>
        g.firstName.toLowerCase().includes(needle) ||
        g.lastName.toLowerCase().includes(needle) ||
        (g.email ?? "").toLowerCase().includes(needle),
    );
  }

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
