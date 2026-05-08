import { environment, type ZuploContext, type ZuploRequest } from "@zuplo/runtime";
import { orderRepository } from "../repositories/orders.ts";
import { ticketRepository } from "../repositories/tickets.ts";
import { eventRepository } from "../repositories/events.ts";
import { ticketTypeRepository } from "../repositories/ticket-types.ts";
import { verifyStripeWebhook } from "../integrations/stripe.ts";
import {
  buildQrCodeUrl,
  renderTicketEmailHtml,
  sendResendEmail,
} from "../integrations/resend.ts";

/**
 * POST /webhooks/stripe — Stripe webhook receiver.
 *
 * Verifies the `Stripe-Signature` HMAC, then dispatches:
 *   payment_intent.succeeded  → flip order to `paid`, mint a ticket, email QR via Resend
 *   payment_intent.payment_failed → mark order canceled
 *   charge.refunded           → flip order to `refunded`
 *
 * Tenant id is read from PaymentIntent metadata that `place_order`
 * stamped on creation.
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
      const order = await orderRepository.get(tenantId, orderId);
      if (!order) break;
      const updated = await orderRepository.update(tenantId, order.id, {
        status: "paid",
        paidAt: new Date().toISOString(),
      });
      // Pick any ticket type for this event so we can issue *a* ticket.
      // Real kits would track line items per order.
      const tt = await ticketTypeRepository.list(tenantId, {
        where: { eventId: updated.eventId },
      });
      const ticketTypeId = tt.items[0]?.id ?? "default";
      const qrCode = `${updated.id}.${crypto.randomUUID().slice(0, 12)}`;
      const ticket = await ticketRepository.create(tenantId, {
        orderId: updated.id,
        ticketTypeId,
        attendeeName: updated.attendeeName,
        attendeeEmail: updated.attendeeEmail,
        qrCode,
        status: "valid",
        checkedInAt: null,
      });

      // Send the ticket email via Resend.
      if (environment.RESEND_API_KEY && environment.RESEND_FROM_EMAIL) {
        const ev = await eventRepository.get(tenantId, updated.eventId);
        if (ev) {
          await sendResendEmail({
            to: updated.attendeeEmail,
            from: environment.RESEND_FROM_EMAIL,
            subject: `Your ticket for ${ev.name}`,
            html: renderTicketEmailHtml({
              attendeeName: updated.attendeeName,
              eventName: ev.name,
              startsAt: ev.startsAt,
              venue: ev.venue,
              qrPayload: qrCode,
            }),
            text: `${ev.name}\n${ev.startsAt} ${ev.venue}\nTicket: ${qrCode}\nQR: ${buildQrCodeUrl(qrCode)}`,
          }).catch((err) => {
            context.log.error(
              `Resend ticket email failed for order ${updated.id}: ${(err as Error).message}`,
            );
          });
        }
      }

      return new Response(
        JSON.stringify({ ok: true, orderId: updated.id, ticketId: ticket.id }),
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
        .update(tenantId, orderId, {
          status: "refunded",
          refundedAt: new Date().toISOString(),
        })
        .catch(() => null);
      return new Response(
        JSON.stringify({ ok: true, orderId, status: "refunded" }),
        { headers: { "content-type": "application/json" } },
      );
    }
    default:
      return new Response(
        JSON.stringify({ ok: true, ignored: event.type }),
        { headers: { "content-type": "application/json" } },
      );
  }

  return new Response(
    JSON.stringify({ ok: true, eventType: event.type }),
    { headers: { "content-type": "application/json" } },
  );
}
