import { environment, type ZuploContext, type ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { shipmentRepository } from "../repositories/shipments.ts";
import { orderRepository } from "../repositories/orders.ts";
import { sendTwilioSms } from "../integrations/twilio.ts";

/**
 * PATCH /shipments/{id}/in-transit — mark a shipment as in transit.
 *
 * Side effect: when Twilio + a buyer phone are configured, sends an
 * SMS with the tracking link so the buyer doesn't have to email
 * support to ask "where's my order".
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  try {
    const updated = await shipmentRepository.update(tenantId, id, {
      status: "in_transit",
      shippedAt: new Date().toISOString(),
    });

    // Best-effort SMS — don't fail the status update if Twilio is unavailable.
    if (
      environment.TWILIO_ACCOUNT_SID &&
      environment.TWILIO_AUTH_TOKEN &&
      environment.TWILIO_FROM_NUMBER
    ) {
      const order = await orderRepository.get(tenantId, updated.orderId);
      if (order?.buyerPhone) {
        const link =
          updated.trackingUrl ??
          `https://www.google.com/search?q=${encodeURIComponent(
            `${updated.carrier} ${updated.trackingNumber}`,
          )}`;
        await sendTwilioSms({
          to: order.buyerPhone,
          body: `Your order ${order.orderNumber} shipped via ${updated.carrier}. Track: ${link}`,
        }).catch((err) => {
          context.log.warn(
            `Twilio tracking SMS failed for order ${order.id}: ${(err as Error).message}`,
          );
        });
      }
    }

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
