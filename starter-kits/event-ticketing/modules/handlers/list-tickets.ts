import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { ticketRepository } from "../repositories/tickets.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const orderId = url.searchParams.get("orderId") ?? undefined;

  const page = await ticketRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    where: orderId ? { orderId } : undefined,
  });

  return new Response(JSON.stringify(page), {
    headers: { "content-type": "application/json" },
  });
}
