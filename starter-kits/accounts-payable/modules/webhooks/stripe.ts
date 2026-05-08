import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { verifyStripeSignature } from "../integrations/stripe.ts";
import { billRepository, billPaymentRepository } from "../repositories/bills.ts";

/**
 * Inbound Stripe webhook for AP payouts.
 *
 * Stripe Transfers do not have invoice events directly, but we listen for
 * payout/transfer reversal events to flip a `BillPayment` from sent to
 * failed and put the source bill back into `approved`. The `tenant_id` and
 * `tenant_bill_id` are stamped into Transfer metadata when we initiate the
 * payment.
 */

interface StripeEvent<T = unknown> {
  id: string;
  type: string;
  data: { object: T };
}

interface TransferLikeObj {
  id: string;
  amount: number;
  metadata: Record<string, string>;
  failure_code?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });
  const rawBody = await request.text();

  const valid = await verifyStripeSignature({ rawBody, signatureHeader: sig });
  if (!valid) return new Response("invalid signature", { status: 400 });

  const event = JSON.parse(rawBody) as StripeEvent<TransferLikeObj>;
  const obj = event.data.object;
  const tenantId = obj.metadata?.tenant_id;
  const tenantBillId = obj.metadata?.tenant_bill_id;
  const tenantPaymentId = obj.metadata?.tenant_payment_id;

  if (!tenantId) {
    return new Response(JSON.stringify({ received: true, ignored: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  switch (event.type) {
    case "transfer.paid":
    case "payout.paid": {
      if (tenantPaymentId) {
        await billPaymentRepository.update(tenantId, tenantPaymentId, {
          paidAt: new Date().toISOString(),
        });
      }
      if (tenantBillId) {
        await billRepository.update(tenantId, tenantBillId, {
          status: "paid",
          paidAt: new Date().toISOString(),
        });
      }
      break;
    }
    case "transfer.reversed":
    case "payout.failed": {
      if (tenantBillId) {
        await billRepository.update(tenantId, tenantBillId, {
          status: "approved", // back to approved so AP can retry
          paidAt: null,
        });
      }
      break;
    }
    default:
      context.log.info(`stripe ap webhook: ignoring ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "content-type": "application/json" },
  });
}
