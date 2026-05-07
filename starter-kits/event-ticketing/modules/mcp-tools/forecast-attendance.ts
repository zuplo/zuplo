import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Event } from "../repositories/events.ts";
import type { Order } from "../repositories/orders.ts";

interface Body {
  eventId: string;
}

interface OrderPage {
  items: Order[];
  nextCursor: string | null;
}

/**
 * Orchestrator: forecast_attendance.
 *
 * Reads the event + paid orders so far, computes the average sales velocity
 * (orders per day since first paid order), and projects expected paid count
 * by `startsAt`. Returns the projected count alongside current sold and
 * remaining capacity so an organizer (or LLM) can decide whether to add
 * inventory or extend marketing.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.eventId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "eventId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = request.headers.get("authorization") ?? "";

  const event = await invokeJson<Event>(
    context,
    `/events/${encodeURIComponent(body.eventId)}`,
    { headers: { authorization: auth } },
  );

  // Walk paid orders for this event.
  const paidOrders: Order[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", eventId: body.eventId, status: "paid" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<OrderPage>(context, `/orders?${qs}`, {
      headers: { authorization: auth },
    });
    paidOrders.push(...page.items);
    cursor = page.nextCursor;
    if (paidOrders.length > 5000) break;
  } while (cursor);

  const now = Date.now();
  const startsAtMs = Date.parse(event.startsAt);
  const daysToEvent = Math.max(0, (startsAtMs - now) / 86400000);

  let dailyVelocity = 0;
  let projectedAdditional = 0;
  if (paidOrders.length >= 2) {
    const paidTimes = paidOrders
      .map((o) => Date.parse(o.paidAt ?? o.placedAt))
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    const earliest = paidTimes[0];
    const elapsedDays = Math.max(1 / 24, (now - earliest) / 86400000);
    dailyVelocity = paidOrders.length / elapsedDays;
    projectedAdditional = Math.round(dailyVelocity * daysToEvent);
  }

  const projectedPaid = paidOrders.length + projectedAdditional;
  const remainingCapacity = Math.max(0, event.capacity - event.ticketsSold);

  return new Response(
    JSON.stringify({
      eventId: event.id,
      startsAt: event.startsAt,
      capacity: event.capacity,
      ticketsSold: event.ticketsSold,
      paidOrdersToDate: paidOrders.length,
      dailyVelocity: Number(dailyVelocity.toFixed(2)),
      daysToEvent: Number(daysToEvent.toFixed(2)),
      projectedAdditional,
      projectedTotalPaid: projectedPaid,
      remainingCapacity,
      willSellOut: projectedPaid >= event.capacity,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
