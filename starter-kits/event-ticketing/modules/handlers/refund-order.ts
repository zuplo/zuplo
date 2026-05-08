import { environment, type ZuploContext, type ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { orderRepository } from "../repositories/orders.ts";
import { createStripeRefund } from "../integrations/stripe.ts";

/**
 * POST /orders/{id}/refund — refund an order.
 *
 * Issues a real Stripe refund against the saved PaymentIntent, then
 * marks the order as `refunded`. Falls back to status-only refund
 * tracking when Stripe isn't configured (dev/in-memory mode).
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  try {
    const order = await orderRepository.get(tenantId, id);
    if (!order) {
      return new Response(
        JSON.stringify({
          error: { type: "not_found", message: "Order not found" },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }

    let stripeRefundId: string | null = null;
    if (environment.STRIPE_SECRET_KEY && order.stripePaymentIntentId) {
      const refund = await createStripeRefund({
        paymentIntent: order.stripePaymentIntentId,
        reason: "requested_by_customer",
      });
      stripeRefundId = refund.id;
    }

    const updated = await orderRepository.update(tenantId, id, {
      status: "refunded",
      refundedAt: new Date().toISOString(),
      stripeRefundId,
    });
    return new Response(JSON.stringify(updated), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: err.message } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }
}
