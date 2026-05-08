import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { verifyStripeSignature } from "../integrations/stripe.ts";
import { sendResendEmail, defaultFrom } from "../integrations/resend.ts";
import { donationRepository } from "../repositories/donations.ts";
import { recurringGiftRepository } from "../repositories/recurring-gifts.ts";
import { donorRepository } from "../repositories/donors.ts";

/**
 * Inbound Stripe webhook for donor management.
 *
 * Handled events:
 *  - checkout.session.completed (mode=payment)        -> record one-off Donation + send acknowledgement
 *  - checkout.session.completed (mode=subscription)   -> upsert RecurringGift
 *  - invoice.payment_succeeded   (recurring renewal)  -> record renewal Donation + acknowledgement
 *  - customer.subscription.deleted                    -> mark RecurringGift canceled
 */

interface StripeEvent<T = unknown> {
  id: string;
  type: string;
  data: { object: T };
}

interface CheckoutSessionObj {
  id: string;
  mode: "payment" | "subscription" | "setup";
  payment_intent: string | null;
  subscription: string | null;
  customer: string | null;
  customer_email: string | null;
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string>;
}

interface InvoiceObj {
  id: string;
  subscription: string | null;
  total: number;
  currency: string;
  charge: string | null;
  customer_email: string | null;
  metadata: Record<string, string>;
  lines?: { data: { metadata?: Record<string, string> }[] };
}

interface SubscriptionObj {
  id: string;
  metadata: Record<string, string>;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });
  const rawBody = await request.text();

  const valid = await verifyStripeSignature({ rawBody, signatureHeader: sig });
  if (!valid) return new Response("invalid signature", { status: 400 });

  const event = JSON.parse(rawBody) as StripeEvent;
  const obj = event.data.object as Record<string, unknown>;
  const tenantId =
    typeof obj.metadata === "object" && obj.metadata !== null
      ? (obj.metadata as Record<string, string>).tenant_id
      : undefined;

  switch (event.type) {
    case "checkout.session.completed": {
      const sess = obj as unknown as CheckoutSessionObj;
      const md = sess.metadata ?? {};
      if (!md.tenant_id || !md.donor_id) break;
      if (sess.mode === "payment" && sess.amount_total != null && sess.currency) {
        await recordOneOff({
          tenantId: md.tenant_id,
          donorId: md.donor_id,
          campaignId: md.campaign_id ?? null,
          amountCents: sess.amount_total,
          currency: sess.currency,
          stripeChargeId: sess.payment_intent ?? sess.id,
          email: sess.customer_email ?? null,
          context,
        });
      } else if (sess.mode === "subscription" && sess.subscription) {
        await upsertRecurringGift({
          tenantId: md.tenant_id,
          donorId: md.donor_id,
          stripeSubscriptionId: sess.subscription,
          stripeCustomerId: sess.customer,
        });
      }
      break;
    }
    case "invoice.payment_succeeded": {
      const inv = obj as unknown as InvoiceObj;
      // Subscription renewals carry tenant metadata on the line items.
      const md =
        inv.metadata && Object.keys(inv.metadata).length > 0
          ? inv.metadata
          : inv.lines?.data?.[0]?.metadata ?? {};
      if (!md.tenant_id || !md.donor_id) break;
      await recordOneOff({
        tenantId: md.tenant_id,
        donorId: md.donor_id,
        campaignId: md.campaign_id ?? null,
        amountCents: inv.total,
        currency: inv.currency,
        stripeChargeId: inv.charge ?? inv.id,
        email: inv.customer_email ?? null,
        context,
      });
      break;
    }
    case "customer.subscription.deleted": {
      const sub = obj as unknown as SubscriptionObj;
      const md = sub.metadata ?? {};
      if (!md.tenant_id) break;
      // Find the local recurring-gift row by stripeSubscriptionId.
      let cursor: string | null | undefined = undefined;
      do {
        const page = await recurringGiftRepository.list(md.tenant_id, {
          limit: 200,
          cursor: cursor ?? undefined,
        });
        const found = page.items.find((g) => g.stripeSubscriptionId === sub.id);
        if (found) {
          await recurringGiftRepository.update(md.tenant_id, found.id, {
            status: "canceled",
          });
          return new Response(JSON.stringify({ received: true }), {
            headers: { "content-type": "application/json" },
          });
        }
        cursor = page.nextCursor;
      } while (cursor);
      break;
    }
    default:
      context.log.info(`stripe donor webhook: ignoring ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true, tenantId }), {
    headers: { "content-type": "application/json" },
  });
}

async function recordOneOff(args: {
  tenantId: string;
  donorId: string;
  campaignId: string | null;
  amountCents: number;
  currency: string;
  stripeChargeId: string;
  email: string | null;
  context: ZuploContext;
}) {
  let donor = null;
  try {
    donor = await donorRepository.get(args.tenantId, args.donorId);
  } catch {
    /* donor may have been deleted; we still record the donation */
  }

  const donation = await donationRepository.create(args.tenantId, {
    donorId: args.donorId,
    campaignId: args.campaignId,
    amountCents: args.amountCents,
    currency: args.currency,
    receivedAt: new Date().toISOString(),
    paymentMethod: "stripe",
    taxDeductibleAmountCents: args.amountCents,
    anonymous: false,
    restrictedFund: null,
    stripeChargeId: args.stripeChargeId,
    acknowledgementEmailId: null,
  });

  if (donor) {
    await donorRepository.update(args.tenantId, donor.id, {
      lifetimeGivingCents: donor.lifetimeGivingCents + args.amountCents,
      giftCount: donor.giftCount + 1,
      lastGiftDate: donation.receivedAt,
      status: "active",
    });
  }

  const email = donor?.email ?? args.email;
  if (email && environment.RESEND_API_KEY) {
    try {
      const sent = await sendResendEmail({
        from: defaultFrom(),
        to: email,
        subject: `Thank you for your gift of $${(args.amountCents / 100).toFixed(2)}`,
        text: `${donor ? `Dear ${donor.firstName},\n\n` : "Hello,\n\n"}Thank you for your generous gift of $${(args.amountCents / 100).toFixed(2)}. This email also serves as your receipt for tax purposes.\n\nWith gratitude,\nThe team`,
        tags: [
          { name: "kit", value: "donor-management" },
          { name: "donation_id", value: donation.id },
        ],
      });
      await donationRepository.update(args.tenantId, donation.id, {
        acknowledgementEmailId: sent.id,
      });
    } catch (err) {
      args.context.log.error(
        `donor stripe webhook: ack email failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

async function upsertRecurringGift(args: {
  tenantId: string;
  donorId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
}) {
  // Try to find an existing gift with this subscription id.
  let cursor: string | null | undefined = undefined;
  do {
    const page = await recurringGiftRepository.list(args.tenantId, {
      limit: 200,
      cursor: cursor ?? undefined,
    });
    const found = page.items.find(
      (g) => g.stripeSubscriptionId === args.stripeSubscriptionId,
    );
    if (found) {
      await recurringGiftRepository.update(args.tenantId, found.id, {
        status: "active",
        stripeCustomerId: args.stripeCustomerId,
      });
      return;
    }
    cursor = page.nextCursor;
  } while (cursor);

  // Otherwise create one. Amount/interval will be reconciled on the first
  // invoice.payment_succeeded event with the actual price.
  await recurringGiftRepository.create(args.tenantId, {
    donorId: args.donorId,
    amountCents: 0,
    currency: "usd",
    intervalUnit: "monthly",
    nextChargeDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: "active",
    createdAt: new Date().toISOString(),
    stripeSubscriptionId: args.stripeSubscriptionId,
    stripeCustomerId: args.stripeCustomerId,
  });
}
