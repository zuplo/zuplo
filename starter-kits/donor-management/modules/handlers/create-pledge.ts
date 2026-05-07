import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { pledgeRepository } from "../repositories/pledges.ts";

interface Body {
  donorId: string;
  amountCents: number;
  dueDate: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const created = await pledgeRepository.create(tenantId, {
    donorId: body.donorId,
    amountCents: body.amountCents,
    fulfilledCents: 0,
    dueDate: body.dueDate,
    status: "open",
    createdAt: new Date().toISOString(),
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
