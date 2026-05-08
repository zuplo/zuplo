import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { verifyStripeSignature } from "../integrations/stripe.ts";
import { invoiceRepository, paymentRepository } from "../repositories/invoices.ts";

/**
 * Inbound Stripe webhook handler.
 *
 * Verifies the `Stripe-Signature` header against STRIPE_WEBHOOK_SECRET and
 * dispatches a small subset of events:
 *
 *   - invoice.payment_succeeded -> mark invoice paid, record payment
 *   - invoice.payment_failed    -> flip invoice to overdue
 *
 * The Stripe invoice id is stored in `metadata.tenant_invoice_id` when the
 * gateway creates the Stripe invoice (see chase_overdue_invoices). That's
 * how we map back to our internal record.
 */

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return new Response("missing signature", { status: 400 });
  }
  const rawBody = await request.text();

  const valid = await verifyStripeSignature({ rawBody, signatureHeader: sig });
  if (!valid) {
    return new Response("invalid signature", { status: 400 });
  }

  const event = JSON.parse(rawBody) as StripeEvent;
  const obj = event.data.object as {
    id: string;
    amount_paid?: number;
    customer?: string;
    metadata?: Record<string, string>;
    payment_intent?: string;
  };

  const tenantId = obj.metadata?.tenant_id;
  const tenantInvoiceId = obj.metadata?.tenant_invoice_id;
  if (!tenantId || !tenantInvoiceId) {
    // Not one of ours — accept and move on so Stripe doesn't retry.
    return new Response(JSON.stringify({ received: true, ignored: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  switch (event.type) {
    case "invoice.payment_succeeded": {
      await invoiceRepository.update(tenantId, tenantInvoiceId, {
        status: "paid",
        paidAt: new Date().toISOString(),
      });
      await paymentRepository.create(tenantId, {
        invoiceId: tenantInvoiceId,
        amountCents: obj.amount_paid ?? 0,
        method: "stripe",
        paidAt: new Date().toISOString(),
        reference: obj.payment_intent ?? obj.id,
        createdAt: new Date().toISOString(),
      });
      break;
    }
    case "invoice.payment_failed": {
      await invoiceRepository.update(tenantId, tenantInvoiceId, {
        status: "overdue",
      });
      break;
    }
    default:
      context.log.info(`stripe webhook: ignoring ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "content-type": "application/json" },
  });
}
