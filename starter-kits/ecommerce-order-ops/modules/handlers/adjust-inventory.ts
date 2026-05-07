import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { inventoryRepository } from "../repositories/inventory.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    sku: string;
    delta: number;
    reason: string;
    performedBy?: string;
  };

  const created = await inventoryRepository.create(tenantId, {
    sku: body.sku,
    delta: body.delta,
    reason: body.reason,
    performedAt: new Date().toISOString(),
    performedBy: body.performedBy ?? "",
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
