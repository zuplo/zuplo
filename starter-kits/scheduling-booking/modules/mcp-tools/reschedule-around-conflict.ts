import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Availability, Booking } from "../repositories/bookings.ts";

/**
 * Orchestrator MCP tool: reschedule_around_conflict.
 *
 * Given an existing bookingId, computes the next available slot for the
 * booking's host that doesn't conflict with their other bookings. Returns the
 * proposed time — does not actually mutate the booking. The LLM caller can
 * confirm with the user, then call reschedule_booking.
 */

interface Body {
  bookingId: string;
  searchDays?: number;
}

interface AvailabilityPage {
  items: Availability[];
  nextCursor: string | null;
}

interface BookingPage {
  items: Booking[];
  nextCursor: string | null;
}

const MS_PER_MIN = 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseHHMM(s: string): { h: number; m: number } {
  const [h, m] = s.split(":").map((x) => parseInt(x, 10));
  return { h: h ?? 0, m: m ?? 0 };
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };
  const searchDays = Math.max(1, Math.min(60, body.searchDays ?? 14));

  const booking = await invokeJson<Booking>(context, `/bookings/${body.bookingId}`, {
    headers: auth,
  });

  // Pull this host's availability + other bookings.
  const allAvailability: Availability[] = [];
  let aCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (aCursor) qs.set("cursor", aCursor);
    const page = await invokeJson<AvailabilityPage>(context, `/availability?${qs}`, {
      headers: auth,
    });
    allAvailability.push(...page.items);
    aCursor = page.nextCursor;
    if (allAvailability.length > 5000) break;
  } while (aCursor);

  const allBookings: Booking[] = [];
  let bCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (bCursor) qs.set("cursor", bCursor);
    const page = await invokeJson<BookingPage>(context, `/bookings?${qs}`, { headers: auth });
    allBookings.push(...page.items);
    bCursor = page.nextCursor;
    if (allBookings.length > 5000) break;
  } while (bCursor);

  const hostAvail = allAvailability.filter((a) => a.ownerEmail === booking.hostEmail);
  const conflicts = allBookings.filter(
    (b) =>
      b.id !== booking.id &&
      b.hostEmail === booking.hostEmail &&
      (b.status === "confirmed" || b.status === "rescheduled"),
  );

  const startSearch = new Date();
  for (let dayOffset = 0; dayOffset < searchDays; dayOffset++) {
    const day = new Date(startSearch.getTime() + dayOffset * MS_PER_DAY);
    const dow = day.getUTCDay();
    const windows = hostAvail.filter((a) => a.dayOfWeek === dow);
    for (const w of windows) {
      const { h: sh, m: sm } = parseHHMM(w.startTime);
      const { h: eh, m: em } = parseHHMM(w.endTime);
      const dayBase = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      for (let m = startMin; m + booking.durationMinutes <= endMin; m += 15) {
        const slotStart = dayBase + m * MS_PER_MIN;
        const slotEnd = slotStart + booking.durationMinutes * MS_PER_MIN;
        if (slotStart < startSearch.getTime()) continue;
        const conflict = conflicts.some((b) => {
          const bStart = new Date(b.scheduledFor).getTime();
          const bEnd = bStart + b.durationMinutes * MS_PER_MIN;
          return slotStart < bEnd && slotEnd > bStart;
        });
        if (!conflict) {
          return new Response(
            JSON.stringify({
              bookingId: booking.id,
              hostEmail: booking.hostEmail,
              proposedScheduledFor: new Date(slotStart).toISOString(),
              durationMinutes: booking.durationMinutes,
              note: "Proposal only — call reschedule_booking to confirm.",
            }),
            { headers: { "content-type": "application/json" } },
          );
        }
      }
    }
  }

  return new Response(
    JSON.stringify({
      bookingId: booking.id,
      hostEmail: booking.hostEmail,
      proposedScheduledFor: null,
      durationMinutes: booking.durationMinutes,
      note: `No free slot in the next ${searchDays} days.`,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
