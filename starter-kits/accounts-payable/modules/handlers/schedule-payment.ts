import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  billPaymentRepository,
  billRepository,
  vendorRepository,
} from "../repositories/bills.ts";
import { transferToVendor } from "../integrations/stripe.ts";

interface Body {
  billId: string;
  amountCents: number;
  method: string;
  scheduledFor: string;
  reference: string;
  /**
   * If `executeNow=true` and the vendor has a Stripe connected account
   * (vendor.stripeAccountId), push the payment to Stripe immediately. The
   * webhook handler will flip the bill to paid when Stripe confirms.
   */
  executeNow?: boolean;
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

  let stripeTransferId: string | null = null;

  if (body.executeNow && environment.STRIPE_SECRET_KEY) {
    try {
      const bill = await billRepository.get(tenantId, body.billId);
      const vendor = await vendorRepository.get(tenantId, bill.vendorId);
      const stripeAccountId = (vendor as { stripeAccountId?: string }).stripeAccountId;
      if (stripeAccountId) {
        const transfer = await transferToVendor({
          amountCents: body.amountCents,
          currency: bill.currency,
          connectedAccountId: stripeAccountId,
          metadata: {
            tenant_id: tenantId,
            tenant_bill_id: bill.id,
            tenant_payment_id: created.id,
          },
          idempotencyKey: `pay:${tenantId}:${created.id}`,
        });
        stripeTransferId = transfer.id;
        // Optimistically update reference on the local payment.
        await billPaymentRepository.update(tenantId, created.id, {
          reference: transfer.id,
        });
      }
    } catch (err) {
      context.log.error(
        `schedule_payment stripe transfer failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return new Response(JSON.stringify({ ...created, stripeTransferId }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
