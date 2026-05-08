import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { orderRepository } from "../repositories/orders.ts";
import { verifyStripeWebhook } from "../integrations/stripe.ts";

/**
 * POST /webhooks/stripe — Stripe webhook receiver.
 *
 * Verifies the `Stripe-Signature` HMAC, then dispatches based on
 * event type. The storefront mints PaymentIntents for orders and
 * stamps `order_id` + `tenant_id` in `metadata` so we can route the
 * event back to the right tenant + order.
 *
 *   payment_intent.succeeded  → flip order to `paid`
 *   payment_intent.payment_failed → mark order canceled
 *   charge.refunded           → flip order to `returned`
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");

  let event;
  try {
    event = await verifyStripeWebhook(rawBody, sig);
  } catch (err) {
    context.log.warn(`Stripe webhook rejected: ${(err as Error).message}`);
    return new Response(
      JSON.stringify({ error: "invalid_signature" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  const obj = event.data.object;
  const tenantId = obj.metadata?.tenant_id;
  const orderId = obj.metadata?.order_id;

  if (!tenantId || !orderId) {
    return new Response(
      JSON.stringify({ ok: true, ignored: "no_tenant_or_order_metadata" }),
      { headers: { "content-type": "application/json" } },
    );
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      await orderRepository
        .update(tenantId, orderId, {
          status: "paid",
          paidAt: new Date().toISOString(),
          stripePaymentIntentId: obj.id,
        })
        .catch(() => null);
      return new Response(
        JSON.stringify({ ok: true, orderId, status: "paid" }),
        { headers: { "content-type": "application/json" } },
      );
    }
    case "payment_intent.payment_failed": {
      await orderRepository
        .update(tenantId, orderId, { status: "canceled" })
        .catch(() => null);
      return new Response(
        JSON.stringify({ ok: true, orderId, status: "canceled" }),
        { headers: { "content-type": "application/json" } },
      );
    }
    case "charge.refunded":
    case "refund.created": {
      await orderRepository
        .update(tenantId, orderId, { status: "returned" })
        .catch(() => null);
      return new Response(
        JSON.stringify({ ok: true, orderId, status: "returned" }),
        { headers: { "content-type": "application/json" } },
      );
    }
    default:
      return new Response(
        JSON.stringify({ ok: true, ignored: event.type }),
        { headers: { "content-type": "application/json" } },
      );
  }
}
