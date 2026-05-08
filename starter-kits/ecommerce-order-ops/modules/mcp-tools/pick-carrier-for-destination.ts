import { environment, type ZuploContext, type ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Order } from "../repositories/orders.ts";
import type { Customer } from "../repositories/customers.ts";
import { getShipEngineRates, type ShipEngineRate } from "../integrations/shipengine.ts";

interface Body {
  orderId: string;
}

interface CustomerPage {
  items: Customer[];
  nextCursor: string | null;
}

/**
 * Orchestrator: pick_carrier_for_destination.
 *
 * Reads the order + buyer, then rate-shops across configured carriers
 * via ShipEngine for the order's ship-to address and parcel weight.
 *
 * Picks the cheapest rate by default, but bumps VIP gold customers to
 * the fastest service. Returns a structured suggestion with the chosen
 * `rateId`, which the agent can pass straight into `create_shipment`
 * to actually purchase the label.
 *
 * Falls back to a rules-only recommendation if ShipEngine isn't
 * configured (dev / in-memory mode).
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.orderId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "orderId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = request.headers.get("authorization") ?? "";

  const order = await invokeJson<Order>(
    context,
    `/orders/${encodeURIComponent(body.orderId)}`,
    { headers: { authorization: auth } },
  );

  // Find the buyer for VIP tier signal.
  let customer: Customer | null = null;
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<CustomerPage>(context, `/customers?${qs}`, {
      headers: { authorization: auth },
    });
    customer = page.items.find((c) => c.id === order.customerId) ?? null;
    if (customer) break;
    cursor = page.nextCursor;
  } while (cursor);

  // Live rate shop if ShipEngine + a ship-to address are configured.
  if (
    environment.SHIPENGINE_API_KEY &&
    order.shipToAddressLine1 &&
    order.shipToCityLocality &&
    order.shipToStateProvince &&
    order.shipToPostalCode &&
    order.shipToCountryCode
  ) {
    const fromName = environment.SHIPENGINE_FROM_NAME ?? "Warehouse";
    const fromAddress1 = environment.SHIPENGINE_FROM_ADDRESS1 ?? "1 Distribution Way";
    const fromCity = environment.SHIPENGINE_FROM_CITY ?? "Reno";
    const fromState = environment.SHIPENGINE_FROM_STATE ?? "NV";
    const fromPostal = environment.SHIPENGINE_FROM_POSTAL ?? "89501";
    const fromCountry = environment.SHIPENGINE_FROM_COUNTRY ?? "US";
    const carrierIds = (environment.SHIPENGINE_CARRIER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    let rates: ShipEngineRate[] = [];
    try {
      rates = await getShipEngineRates({
        shipFrom: {
          name: fromName,
          addressLine1: fromAddress1,
          cityLocality: fromCity,
          stateProvince: fromState,
          postalCode: fromPostal,
          countryCode: fromCountry,
        },
        shipTo: {
          name: order.shipToName ?? "Customer",
          addressLine1: order.shipToAddressLine1,
          addressLine2: order.shipToAddressLine2 ?? undefined,
          cityLocality: order.shipToCityLocality,
          stateProvince: order.shipToStateProvince,
          postalCode: order.shipToPostalCode,
          countryCode: order.shipToCountryCode,
        },
        parcel: {
          weightOz: order.parcelWeightOz ?? 16,
        },
        carrierIds: carrierIds.length > 0 ? carrierIds : undefined,
      });
    } catch (err) {
      // Log the upstream error server-side; expose only a stable type to the caller.
      context.log.warn("ShipEngine rate shop failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      return new Response(
        JSON.stringify({
          error: { type: "rate_shop_failed" },
        }),
        { status: 502, headers: { "content-type": "application/json" } },
      );
    }

    if (rates.length === 0) {
      return new Response(
        JSON.stringify({
          orderId: order.id,
          rates: [],
          reasons: ["No carriers returned a rate for this destination."],
        }),
        { headers: { "content-type": "application/json" } },
      );
    }

    const sortedByPrice = [...rates].sort(
      (a, b) => a.shipping_amount.amount - b.shipping_amount.amount,
    );
    const sortedBySpeed = [...rates].sort(
      (a, b) => (a.delivery_days ?? 99) - (b.delivery_days ?? 99),
    );

    const reasons: string[] = [];
    let chosen: ShipEngineRate;
    if (customer?.vipTier === "gold") {
      chosen = sortedBySpeed[0];
      reasons.push("VIP gold tier — picked the fastest carrier.");
    } else if (order.totalCents >= 50000) {
      // Insure higher-value orders with a 2-day-ish service.
      chosen =
        sortedBySpeed.find((r) => (r.delivery_days ?? 99) <= 2) ?? sortedByPrice[0];
      reasons.push("Order > $500 — biased toward 2-day service.");
    } else {
      chosen = sortedByPrice[0];
      reasons.push("Default — cheapest available rate.");
    }

    return new Response(
      JSON.stringify({
        orderId: order.id,
        recommendedCarrier: chosen.carrier_friendly_name,
        recommendedService: chosen.service_type,
        rateId: chosen.rate_id,
        carrierId: chosen.carrier_id,
        serviceCode: chosen.service_code,
        shippingAmount: chosen.shipping_amount,
        estimatedDeliveryDate: chosen.estimated_delivery_date,
        deliveryDays: chosen.delivery_days,
        reasons,
        allRates: rates,
      }),
      { headers: { "content-type": "application/json" } },
    );
  }

  // Fallback: rules-only recommendation when ShipEngine isn't wired.
  let carrier = "USPS";
  let service = "Priority Mail";
  const reasons: string[] = [];

  if (customer?.vipTier === "gold") {
    carrier = "FedEx";
    service = "Priority Overnight";
    reasons.push("VIP gold tier — overnight by policy");
  } else if (order.totalCents >= 50000) {
    carrier = "UPS";
    service = "2nd Day Air";
    reasons.push("Order > $500 — insured 2-day");
  } else if (order.shippingCents >= 2000) {
    carrier = "UPS";
    service = "Ground";
    reasons.push("Buyer paid for premium ground");
  } else {
    reasons.push("Default low-cost domestic ground (configure SHIPENGINE_API_KEY for live rates)");
  }

  return new Response(
    JSON.stringify({
      orderId: order.id,
      recommendedCarrier: carrier,
      recommendedService: service,
      rateId: null,
      reasons,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
