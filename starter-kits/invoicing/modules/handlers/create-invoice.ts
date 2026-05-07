import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { invoiceRepository } from "../repositories/invoices.ts";

interface Body {
  customerId: string;
  number: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  dueDate: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await invoiceRepository.create(tenantId, {
    customerId: body.customerId,
    number: body.number,
    status: "draft",
    subtotalCents: body.subtotalCents,
    taxCents: body.taxCents,
    totalCents: body.totalCents,
    currency: body.currency,
    dueDate: body.dueDate,
    sentAt: null,
    paidAt: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
