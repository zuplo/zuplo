import { environment, type ZuploContext, type ZuploRequest } from "@zuplo/runtime";
import { shipmentRepository } from "../repositories/shipments.ts";
import { orderRepository } from "../repositories/orders.ts";
import { sendTwilioSms } from "../integrations/twilio.ts";

/**
 * POST /webhooks/shipengine — ShipEngine tracking webhook receiver.
 *
 * ShipEngine doesn't sign webhooks with HMAC (yet); the documented
 * pattern is a shared secret in a custom header you configure on the
 * webhook subscription. We compare against `SHIPENGINE_WEBHOOK_SECRET`.
 *
 * On track_update events we flip the matching shipment to `in_transit`,
 * `delivered`, or `exception`. On `delivered` we also fire a Twilio SMS
 * thanking the buyer (if a phone is on the order).
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const sharedSecret = environment.SHIPENGINE_WEBHOOK_SECRET;
  if (sharedSecret) {
    const provided = request.headers.get("x-shipengine-secret");
    if (provided !== sharedSecret) {
      return new Response(
        JSON.stringify({ error: "invalid_secret" }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }
  }
  const tenantId =
    request.headers.get("x-tenant-id") ?? environment.DEFAULT_TENANT_ID ?? "default";

  let body: {
    resource_url?: string;
    resource_type?: string;
    data?: {
      tracking_number?: string;
      carrier_code?: string;
      status_code?: string;
      status_description?: string;
      events?: Array<{ description: string; occurred_at: string }>;
    };
  };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid_json" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  if (body.resource_type !== "API_TRACK") {
    return new Response(
      JSON.stringify({ ok: true, ignored: body.resource_type }),
      { headers: { "content-type": "application/json" } },
    );
  }

  const trackingNumber = body.data?.tracking_number;
  if (!trackingNumber) {
    return new Response(
      JSON.stringify({ ok: true, ignored: "no_tracking_number" }),
      { headers: { "content-type": "application/json" } },
    );
  }

  // Find the shipment by tracking number.
  const page = await shipmentRepository.list(tenantId, {
    where: { trackingNumber },
    limit: 1,
  });
  const shipment = page.items[0];
  if (!shipment) {
    return new Response(
      JSON.stringify({ ok: true, ignored: "no_matching_shipment" }),
      { headers: { "content-type": "application/json" } },
    );
  }

  const status = body.data?.status_code ?? "";
  let nextStatus: "in_transit" | "delivered" | "exception" = "in_transit";
  if (status === "DE") nextStatus = "delivered";
  else if (status === "EX" || status === "UN") nextStatus = "exception";

  const updated = await shipmentRepository.update(tenantId, shipment.id, {
    status: nextStatus,
    deliveredAt: nextStatus === "delivered" ? new Date().toISOString() : null,
  });

  // Notify buyer via Twilio on delivered or exception.
  if (
    (nextStatus === "delivered" || nextStatus === "exception") &&
    environment.TWILIO_ACCOUNT_SID &&
    environment.TWILIO_AUTH_TOKEN &&
    environment.TWILIO_FROM_NUMBER
  ) {
    const order = await orderRepository.get(tenantId, updated.orderId);
    if (order?.buyerPhone) {
      const message =
        nextStatus === "delivered"
          ? `Your order ${order.orderNumber} was delivered. Thanks for shopping with us!`
          : `Heads up — there's an issue with order ${order.orderNumber} (${
              body.data?.status_description ?? "carrier exception"
            }). Reply to this message and we'll sort it out.`;
      await sendTwilioSms({ to: order.buyerPhone, body: message }).catch(
        (err) =>
          context.log.warn(
            `Twilio delivery SMS failed for order ${order.id}: ${(err as Error).message}`,
          ),
      );
    }
  }

  return new Response(
    JSON.stringify({ ok: true, shipmentId: updated.id, status: nextStatus }),
    { headers: { "content-type": "application/json" } },
  );
}
