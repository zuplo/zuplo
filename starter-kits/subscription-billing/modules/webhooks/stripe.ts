import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import {
  verifyStripeSignature,
  mapStripeStatus,
  type StripeSubscription,
} from "../integrations/stripe.ts";
import {
  subscriptionRepository,
  billingInvoiceRepository,
} from "../repositories/subscriptions.ts";

/**
 * Inbound Stripe webhook handler.
 *
 * Stripe is the source of truth for subscription state. We listen for the
 * lifecycle events and reconcile the local mirror. Subscribe in the Stripe
 * Dashboard (or `stripe listen --forward-to .../webhooks/stripe`) and copy
 * the signing secret to STRIPE_WEBHOOK_SECRET.
 *
 * Handled events:
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *   - invoice.payment_succeeded   (writes a BillingInvoice row, status=paid)
 *   - invoice.payment_failed      (writes a BillingInvoice row, status=failed)
 */

interface StripeEvent<T = unknown> {
  id: string;
  type: string;
  data: { object: T };
}

interface InvoiceObj {
  id: string;
  subscription: string | null;
  total: number;
  status: string;
  period_start: number;
  period_end: number;
  metadata: Record<string, string>;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });
  const rawBody = await request.text();

  const valid = await verifyStripeSignature({ rawBody, signatureHeader: sig });
  if (!valid) return new Response("invalid signature", { status: 400 });

  const event = JSON.parse(rawBody) as StripeEvent;

  switch (event.type) {
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as StripeSubscription;
      const tenantId = sub.metadata?.tenant_id;
      if (!tenantId) break;
      const local = await findSubscriptionByStripeId(tenantId, sub.id);
      if (!local) break;
      await subscriptionRepository.update(tenantId, local.id, {
        status: mapStripeStatus(sub.status, sub.pause_collection),
        currentPeriodStart: new Date(sub.current_period_start * 1000).toISOString(),
        currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
        canceledAt: sub.canceled_at
          ? new Date(sub.canceled_at * 1000).toISOString()
          : null,
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      });
      break;
    }

    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const inv = event.data.object as InvoiceObj;
      const tenantId = inv.metadata?.tenant_id;
      if (!tenantId || !inv.subscription) break;
      const local = await findSubscriptionByStripeId(tenantId, inv.subscription);
      if (!local) break;
      await billingInvoiceRepository.create(tenantId, {
        subscriptionId: local.id,
        periodStart: new Date(inv.period_start * 1000).toISOString(),
        periodEnd: new Date(inv.period_end * 1000).toISOString(),
        totalCents: inv.total,
        status: event.type === "invoice.payment_succeeded" ? "paid" : "failed",
        createdAt: new Date().toISOString(),
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

/**
 * Tiny lookup helper. With a relational adapter you'd use a where filter;
 * with the in-memory and KV adapters we paginate. For this kit we cap the
 * walk at a reasonable size — production users with millions of subs should
 * index by stripeSubscriptionId in their adapter of choice.
 */
async function findSubscriptionByStripeId(
  tenantId: string,
  stripeSubscriptionId: string,
) {
  let cursor: string | null | undefined = undefined;
  do {
    const page = await subscriptionRepository.list(tenantId, {
      limit: 200,
      cursor: cursor ?? undefined,
    });
    const found = page.items.find(
      (s) => s.stripeSubscriptionId === stripeSubscriptionId,
    );
    if (found) return found;
    cursor = page.nextCursor;
  } while (cursor);
  return null;
}
