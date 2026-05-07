import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { discountRepository, type Discount } from "../repositories/discounts.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    code: string;
    eventId: string;
    kind: Discount["kind"];
    value: number;
    maxUses: number;
    expiresAt: string;
  };

  const created = await discountRepository.create(tenantId, {
    code: body.code,
    eventId: body.eventId,
    kind: body.kind,
    value: body.value,
    maxUses: body.maxUses,
    usedCount: 0,
    expiresAt: body.expiresAt,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
