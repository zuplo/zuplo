import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { reservationRepository } from "../repositories/reservations.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const guestId = url.searchParams.get("guestId");
  const tableId = url.searchParams.get("tableId");
  const status = url.searchParams.get("status");

  const page = await reservationRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "scheduledFor", direction: "asc" },
  });

  let items = page.items;
  if (from) items = items.filter((r) => r.scheduledFor >= from);
  if (to) items = items.filter((r) => r.scheduledFor < to);
  if (guestId) items = items.filter((r) => r.guestId === guestId);
  if (tableId) items = items.filter((r) => r.tableId === tableId);
  if (status) items = items.filter((r) => r.status === status);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
