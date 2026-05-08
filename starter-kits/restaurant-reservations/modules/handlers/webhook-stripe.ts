import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { reservationRepository } from "../repositories/reservations.ts";
import { verifyStripeWebhook } from "../integrations/stripe.ts";

/**
 * POST /webhooks/stripe — Stripe Checkout webhook receiver.
 *
 * Verifies the `Stripe-Signature` HMAC, then dispatches:
 *   checkout.session.completed   → mark deposit paid
 *   checkout.session.expired     → leave the booking but flip deposit to refunded
 *   charge.refunded              → mark deposit refunded
 *
 * Tenant + reservation id come from session metadata stamped by
 * `create_reservation` when the deposit Checkout was minted.
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

  const obj = event.data.object as Record<string, unknown> & {
    metadata?: Record<string, string>;
  };
  const tenantId = obj.metadata?.tenant_id;
  const reservationId = obj.metadata?.reservation_id;

  if (!tenantId || !reservationId) {
    return new Response(
      JSON.stringify({ ok: true, ignored: "no_tenant_or_reservation_metadata" }),
      { headers: { "content-type": "application/json" } },
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      await reservationRepository
        .update(tenantId, reservationId, { depositStatus: "paid" })
        .catch(() => null);
      return new Response(
        JSON.stringify({ ok: true, reservationId, depositStatus: "paid" }),
        { headers: { "content-type": "application/json" } },
      );
    }
    case "checkout.session.expired":
    case "charge.refunded":
    case "refund.created": {
      await reservationRepository
        .update(tenantId, reservationId, { depositStatus: "refunded" })
        .catch(() => null);
      return new Response(
        JSON.stringify({ ok: true, reservationId, depositStatus: "refunded" }),
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
