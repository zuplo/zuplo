import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  availabilityRepository,
  bookingRepository,
  eventTypeRepository,
  type Availability,
  type Booking,
  type EventType,
} from "../repositories/bookings.ts";

interface Body {
  eventTypeSlug: string;
  dateFrom: string;
  dateTo: string;
}

interface Slot {
  start: string;
  end: string;
  hostEmail: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
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
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const eventTypePage = await eventTypeRepository.list(tenantId, { limit: 200 });
  const eventType: EventType | undefined = eventTypePage.items.find(
    (et) => et.slug === body.eventTypeSlug && et.active !== false,
  );
  if (!eventType) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Event type not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  // Pull all of this owner's availability windows.
  const allAvail = await availabilityRepository.list(tenantId, { limit: 200 });
  const windows = allAvail.items.filter((a) => a.ownerEmail === eventType.ownerEmail);

  // Pull all of this owner's existing confirmed/rescheduled bookings.
  const allBookings = await bookingRepository.list(tenantId, { limit: 200 });
  const busy = allBookings.items.filter(
    (b) =>
      b.hostEmail === eventType.ownerEmail &&
      (b.status === "confirmed" || b.status === "rescheduled"),
  );

  const from = new Date(body.dateFrom);
  const to = new Date(body.dateTo);
  const duration = eventType.durationMinutes;
  const buffBefore = eventType.bufferBeforeMinutes ?? 0;
  const buffAfter = eventType.bufferAfterMinutes ?? 0;

  const slots: Slot[] = [];
  for (const day of iterateDays(from, to)) {
    const dow = day.getUTCDay();
    for (const w of windows.filter((x: Availability) => x.dayOfWeek === dow)) {
      const { h: sh, m: sm } = parseHHMM(w.startTime);
      const { h: eh, m: em } = parseHHMM(w.endTime);
      const dayStart = new Date(
        Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), sh, sm),
      ).getTime();
      const dayEnd = new Date(
        Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), eh, em),
      ).getTime();

      let cursor = dayStart;
      while (cursor + duration * MS_PER_MIN <= dayEnd) {
        const slotStart = cursor;
        const slotEnd = cursor + duration * MS_PER_MIN;
        const blocked = busy.some((b: Booking) => {
          const bStart = new Date(b.scheduledFor).getTime() - buffBefore * MS_PER_MIN;
          const bEnd =
            new Date(b.scheduledFor).getTime() +
            b.durationMinutes * MS_PER_MIN +
            buffAfter * MS_PER_MIN;
          return slotStart < bEnd && slotEnd > bStart;
        });
        if (!blocked) {
          slots.push({
            start: new Date(slotStart).toISOString(),
            end: new Date(slotEnd).toISOString(),
            hostEmail: eventType.ownerEmail,
          });
        }
        cursor += duration * MS_PER_MIN;
      }
    }
  }

  return new Response(JSON.stringify({ eventTypeSlug: eventType.slug, slots }), {
    headers: { "content-type": "application/json" },
  });
}
