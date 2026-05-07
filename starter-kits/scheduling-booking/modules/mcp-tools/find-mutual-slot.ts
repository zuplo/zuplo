import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Availability, Booking } from "../repositories/bookings.ts";

/**
 * Orchestrator MCP tool: find_mutual_slot.
 *
 * Given a list of host emails and a date window, returns the top 5 time slots
 * where every host is free (their availability intersected, minus existing
 * confirmed/rescheduled bookings).
 */

interface Body {
  hostEmails: string[];
  durationMinutes: number;
  dateFrom: string;
  dateTo: string;
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

function parseHHMM(s: string): { h: number; m: number } {
  const [h, m] = s.split(":").map((x) => parseInt(x, 10));
  return { h: h ?? 0, m: m ?? 0 };
}

function* iterateDays(from: Date, to: Date): Generator<Date> {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (d.getTime() <= end.getTime()) {
    yield new Date(d.getTime());
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };
  const duration = Math.max(5, body.durationMinutes);
  const hosts = Array.from(new Set(body.hostEmails));

  // Pull availability and bookings — paginate to be safe.
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

  const from = new Date(body.dateFrom);
  const to = new Date(body.dateTo);

  // For each candidate slot (15-min granularity), check that every host
  // has an availability window covering it AND no busy booking conflicts.
  const candidates: { start: string; end: string }[] = [];
  for (const day of iterateDays(from, to)) {
    const dow = day.getUTCDay();
    // Compute the day intersection of all hosts' available hours.
    const perHost = hosts.map((host) =>
      allAvailability.filter((a) => a.ownerEmail === host && a.dayOfWeek === dow),
    );
    if (perHost.some((arr) => arr.length === 0)) continue;

    // Use the latest start and the earliest end across the first window of each host.
    let latestStartMin = 0;
    let earliestEndMin = 24 * 60;
    for (const host of perHost) {
      const w = host[0];
      const { h: sh, m: sm } = parseHHMM(w.startTime);
      const { h: eh, m: em } = parseHHMM(w.endTime);
      latestStartMin = Math.max(latestStartMin, sh * 60 + sm);
      earliestEndMin = Math.min(earliestEndMin, eh * 60 + em);
    }
    if (earliestEndMin - latestStartMin < duration) continue;

    const dayBase = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    for (let m = latestStartMin; m + duration <= earliestEndMin; m += 15) {
      const slotStart = dayBase + m * MS_PER_MIN;
      const slotEnd = slotStart + duration * MS_PER_MIN;
      const conflict = allBookings.some((b) => {
        if (!hosts.includes(b.hostEmail)) return false;
        if (b.status !== "confirmed" && b.status !== "rescheduled") return false;
        const bStart = new Date(b.scheduledFor).getTime();
        const bEnd = bStart + b.durationMinutes * MS_PER_MIN;
        return slotStart < bEnd && slotEnd > bStart;
      });
      if (!conflict) {
        candidates.push({
          start: new Date(slotStart).toISOString(),
          end: new Date(slotEnd).toISOString(),
        });
      }
    }
  }

  return new Response(
    JSON.stringify({
      hostEmails: hosts,
      durationMinutes: duration,
      slots: candidates.slice(0, 5),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
