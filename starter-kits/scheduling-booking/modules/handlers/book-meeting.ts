import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { bookingRepository } from "../repositories/bookings.ts";

interface Body {
  eventTypeSlug: string;
  hostEmail: string;
  attendeeEmail: string;
  attendeeName: string;
  scheduledFor: string;
  durationMinutes: number;
  notes?: string;
  location?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await bookingRepository.create(tenantId, {
    eventTypeSlug: body.eventTypeSlug,
    hostEmail: body.hostEmail,
    attendeeEmail: body.attendeeEmail,
    attendeeName: body.attendeeName,
    scheduledFor: body.scheduledFor,
    durationMinutes: body.durationMinutes,
    status: "confirmed",
    canceledAt: null,
    cancelReason: null,
    notes: body.notes ?? null,
    location: body.location ?? null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
