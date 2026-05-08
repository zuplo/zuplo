import { environment, type ZuploContext, type ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { orderRepository } from "../repositories/orders.ts";
import { eventRepository } from "../repositories/events.ts";
import { createStripePaymentIntent } from "../integrations/stripe.ts";

/**
 * POST /orders — place a ticket order.
 *
 * 1. Persist the Order in `pending` state.
 * 2. Mint a Stripe PaymentIntent for the total.
 * 3. Return the order + PaymentIntent client_secret.
 *
 * The frontend confirms the PaymentIntent with Stripe.js, and Stripe
 * fires `payment_intent.succeeded` to /webhooks/stripe — that flips
 * the order to `paid` and emails the QR ticket via Resend.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    eventId: string;
    attendeeEmail: string;
    attendeeName: string;
    totalCents: number;
    currency?: string;
  };

  const event = await eventRepository.get(tenantId, body.eventId);

  const created = await orderRepository.create(tenantId, {
    eventId: body.eventId,
    attendeeEmail: body.attendeeEmail,
    attendeeName: body.attendeeName,
    totalCents: body.totalCents,
    currency: body.currency ?? "USD",
    status: "pending",
    placedAt: new Date().toISOString(),
    paidAt: null,
    refundedAt: null,
  });

  let paymentIntent: {
    id: string;
    clientSecret: string;
    status: string;
  } | null = null;
  if (environment.STRIPE_SECRET_KEY) {
    const intent = await createStripePaymentIntent({
      amountCents: body.totalCents,
      currency: body.currency ?? "USD",
      description: event
        ? `${event.name} — ${body.attendeeName}`
        : `Ticket order — ${body.attendeeName}`,
      receiptEmail: body.attendeeEmail,
      metadata: {
        order_id: created.id,
        tenant_id: tenantId,
        event_id: body.eventId,
      },
    });
    paymentIntent = {
      id: intent.id,
      clientSecret: intent.client_secret,
      status: intent.status,
    };
    // Stash the intent id so the webhook can match it back to the order.
    await orderRepository.update(tenantId, created.id, {
      stripePaymentIntentId: intent.id,
    });
  }

  return new Response(
    JSON.stringify({
      order: created,
      paymentIntent,
    }),
    {
      status: 201,
      headers: { "content-type": "application/json" },
    },
  );
}
