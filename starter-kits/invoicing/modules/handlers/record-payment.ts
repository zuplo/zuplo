import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { invoiceRepository, paymentRepository } from "../repositories/invoices.ts";

interface Body {
  invoiceId: string;
  amountCents: number;
  method: string;
  paidAt: string;
  reference: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const payment = await paymentRepository.create(tenantId, {
    invoiceId: body.invoiceId,
    amountCents: body.amountCents,
    method: body.method,
    paidAt: body.paidAt,
    reference: body.reference,
    createdAt: new Date().toISOString(),
  });

  // Best-effort: mark the invoice paid. Real implementations would compare
  // sum(payments) vs invoice.totalCents before flipping status.
  try {
    await invoiceRepository.update(tenantId, body.invoiceId, {
      status: "paid",
      paidAt: body.paidAt,
    });
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }

  return new Response(JSON.stringify(payment), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
