import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { shipmentRepository } from "../repositories/shipments.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const orderId = url.searchParams.get("orderId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;

  const where: Record<string, string> = {};
  if (orderId) where.orderId = orderId;
  if (status) where.status = status;

  const page = await shipmentRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    where: Object.keys(where).length > 0 ? (where as never) : undefined,
  });

  return new Response(JSON.stringify(page), {
    headers: { "content-type": "application/json" },
  });
}
