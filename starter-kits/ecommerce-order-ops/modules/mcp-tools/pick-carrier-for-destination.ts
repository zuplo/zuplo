import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Order } from "../repositories/orders.ts";
import type { Customer } from "../repositories/customers.ts";

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
 * Reads the order + buyer to pick a recommended carrier and service
 * using simple rules (channel, total value, VIP tier). Returns a
 * suggestion the agent can pass directly to `create_shipment`.
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

  // Fetch customers list and find this customer for vipTier signal.
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
    reasons.push("Default low-cost domestic ground");
  }

  return new Response(
    JSON.stringify({
      orderId: order.id,
      recommendedCarrier: carrier,
      recommendedService: service,
      reasons,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
