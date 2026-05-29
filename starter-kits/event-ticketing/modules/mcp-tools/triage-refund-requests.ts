import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Order } from "../repositories/orders.ts";
import type { Event } from "../repositories/events.ts";

interface Body {
  eventId: string;
  daysBeforeEvent?: number;
}

interface OrderPage {
  items: Order[];
  nextCursor: string | null;
}

/**
 * Orchestrator: triage_refund_requests.
 *
 * Lists canceled-but-not-refunded orders for an event when the event is
 * within `daysBeforeEvent` of starting (default 14). The result lets an
 * organizer or LLM batch-process refunds before the cutoff window expires.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.eventId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "eventId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const window = Math.max(1, Math.min(180, body.daysBeforeEvent ?? 14));
  const auth = request.headers.get("authorization") ?? "";

  const event = await invokeJson<Event>(
    context,
    `/events/${encodeURIComponent(body.eventId)}`,
    { headers: { authorization: auth } },
  );
  const startsAtMs = Date.parse(event.startsAt);
  const daysToEvent = (startsAtMs - Date.now()) / 86400000;
  const inWindow = daysToEvent <= window && daysToEvent >= 0;

  const candidates: Order[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      eventId: body.eventId,
      status: "canceled",
    });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<OrderPage>(context, `/orders?${qs}`, {
      headers: { authorization: auth },
    });
    for (const o of page.items) {
      if (o.refundedAt) continue;
      candidates.push(o);
    }
    cursor = page.nextCursor;
    if (candidates.length > 1000) break;
  } while (cursor);

  return new Response(
    JSON.stringify({
      eventId: event.id,
      startsAt: event.startsAt,
      daysToEvent: Number(daysToEvent.toFixed(2)),
      windowDays: window,
      inWindow,
      count: candidates.length,
      orders: candidates,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
