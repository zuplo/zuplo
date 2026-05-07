import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { orderRepository } from "../repositories/orders.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const eventId = url.searchParams.get("eventId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;

  const where: Record<string, string> = {};
  if (eventId) where.eventId = eventId;
  if (status) where.status = status;

  const page = await orderRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    where: Object.keys(where).length > 0 ? (where as never) : undefined,
    orderBy: { field: "placedAt", direction: "desc" },
  });

  return new Response(JSON.stringify(page), {
    headers: { "content-type": "application/json" },
  });
}
