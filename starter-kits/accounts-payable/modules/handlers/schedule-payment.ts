import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { billPaymentRepository } from "../repositories/bills.ts";

interface Body {
  billId: string;
  amountCents: number;
  method: string;
  scheduledFor: string;
  reference: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await billPaymentRepository.create(tenantId, {
    billId: body.billId,
    amountCents: body.amountCents,
    method: body.method,
    scheduledFor: body.scheduledFor,
    paidAt: null,
    reference: body.reference,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
