import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { IncidentTicket } from "../repositories/tickets.ts";

/**
 * Orchestrator: escalate_breaching_sla.
 *
 * Returns the list of open tickets whose `slaBreachAt` is within `minutesBefore`
 * of now. Use the result to page the on-call, escalate to a manager, or post
 * to a war-room channel.
 */

interface Body {
  minutesBefore?: number;
}

interface TicketPage {
  items: IncidentTicket[];
  nextCursor: string | null;
}

const OPEN_STATUSES = new Set<IncidentTicket["status"]>([
  "new",
  "in_progress",
  "awaiting_user",
]);

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const minutesBefore = Math.max(1, Math.min(1440, body.minutesBefore ?? 30));
  const auth = request.headers.get("authorization") ?? "";

  const cutoffMs = Date.now() + minutesBefore * 60_000;

  const breaching: Array<IncidentTicket & { minutesUntilBreach: number }> = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<TicketPage>(context, `/tickets?${qs}`, {
      headers: { authorization: auth },
    });
    for (const ticket of page.items) {
      if (!OPEN_STATUSES.has(ticket.status)) continue;
      if (!ticket.slaBreachAt) continue;
      const breachMs = Date.parse(ticket.slaBreachAt);
      if (Number.isNaN(breachMs)) continue;
      if (breachMs > cutoffMs) continue;
      breaching.push({
        ...ticket,
        minutesUntilBreach: Math.round((breachMs - Date.now()) / 60_000),
      });
    }
    cursor = page.nextCursor;
    if (breaching.length > 500) break;
  } while (cursor);

  // Sort soonest first (negative minutes = already breached).
  breaching.sort((a, b) => a.minutesUntilBreach - b.minutesUntilBreach);

  return new Response(
    JSON.stringify({
      minutesBefore,
      count: breaching.length,
      tickets: breaching,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
