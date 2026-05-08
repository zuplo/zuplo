import { environment, type ZuploContext, type ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { orderRepository } from "../repositories/orders.ts";
import { shipmentRepository } from "../repositories/shipments.ts";
import { purchaseShipEngineLabel } from "../integrations/shipengine.ts";

/**
 * POST /shipments — create a shipment.
 *
 * If `rateId` is provided (e.g. the agent ran `pick_carrier_for_destination`
 * first), we call ShipEngine to purchase the label, capture the tracking
 * number, and persist the Shipment with the label PDF URL.
 *
 * Otherwise we trust the caller-supplied `carrier` / `service` /
 * `trackingNumber` and persist the Shipment directly — useful when
 * labels come from a different system.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    orderId: string;
    rateId?: string;
    carrier?: string;
    service?: string;
    trackingNumber?: string;
    testLabel?: boolean;
  };

  let carrier = body.carrier ?? "Unknown";
  let service = body.service ?? "Standard";
  let trackingNumber = body.trackingNumber ?? "";
  let shipengineLabelId: string | null = null;
  let labelUrl: string | null = null;
  let trackingUrl: string | null = null;

  if (body.rateId && environment.SHIPENGINE_API_KEY) {
    const order = await orderRepository.get(tenantId, body.orderId);
    if (!order) {
      return new Response(
        JSON.stringify({
          error: { type: "not_found", message: "Order not found" },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    const label = await purchaseShipEngineLabel({
      rateId: body.rateId,
      testLabel: body.testLabel ?? false,
    });
    carrier = label.carrier_code;
    service = label.service_code;
    trackingNumber = label.tracking_number;
    shipengineLabelId = label.label_id;
    labelUrl = label.label_download.pdf ?? label.label_download.href ?? null;
    trackingUrl = label.trackingUrl ?? null;
  }

  if (!trackingNumber) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "trackingNumber (or rateId for ShipEngine purchase) is required",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const created = await shipmentRepository.create(tenantId, {
    orderId: body.orderId,
    carrier,
    service,
    trackingNumber,
    status: "label_purchased",
    shippedAt: null,
    deliveredAt: null,
    shipengineLabelId,
    labelUrl,
    trackingUrl,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
