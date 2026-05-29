import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Booking } from "../repositories/bookings.ts";

/**
 * Orchestrator MCP tool: enforce_meeting_budget.
 *
 * Sums the booked hours for an owner during a given week, flags whether they
 * are over the configured maxHours, and returns the breakdown.
 */

interface Body {
  ownerEmail: string;
  weekStartDate: string;
  maxHours: number;
}

interface BookingPage {
  items: Booking[];
  nextCursor: string | null;
}

const MS_PER_MIN = 60 * 1000;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };
  const weekStart = new Date(body.weekStartDate).getTime();
  const weekEnd = weekStart + MS_PER_WEEK;
  const maxMinutes = body.maxHours * 60;

  const all: Booking[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<BookingPage>(context, `/bookings?${qs}`, { headers: auth });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 5000) break;
  } while (cursor);

  const inWindow = all.filter((b) => {
    if (b.hostEmail !== body.ownerEmail) return false;
    if (b.status !== "confirmed" && b.status !== "rescheduled" && b.status !== "completed")
      return false;
    const t = new Date(b.scheduledFor).getTime();
    return t >= weekStart && t < weekEnd;
  });

  const bookedMinutes = inWindow.reduce((sum, b) => sum + b.durationMinutes, 0);
  const overByMinutes = Math.max(0, bookedMinutes - maxMinutes);

  return new Response(
    JSON.stringify({
      ownerEmail: body.ownerEmail,
      weekStartDate: body.weekStartDate,
      maxHours: body.maxHours,
      bookedHours: +(bookedMinutes / 60).toFixed(2),
      overBudget: bookedMinutes > maxMinutes,
      overByHours: +(overByMinutes / 60).toFixed(2),
      bookingCount: inWindow.length,
      bookings: inWindow.map((b) => ({
        id: b.id,
        scheduledFor: b.scheduledFor,
        durationMinutes: b.durationMinutes,
        attendeeEmail: b.attendeeEmail,
        eventTypeSlug: b.eventTypeSlug,
      })),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
