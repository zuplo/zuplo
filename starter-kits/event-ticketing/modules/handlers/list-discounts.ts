import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { discountRepository } from "../repositories/discounts.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const eventId = url.searchParams.get("eventId") ?? undefined;

  const page = await discountRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    where: eventId ? { eventId } : undefined,
  });

  return new Response(JSON.stringify(page), {
    headers: { "content-type": "application/json" },
  });
}
