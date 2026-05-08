import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { bookingRepository } from "../repositories/bookings.ts";
import { createGCalEvent } from "../integrations/google-calendar.ts";
import { createZoomMeeting } from "../integrations/zoom.ts";
import { sendTwilioSms } from "../integrations/twilio.ts";

interface Body {
  eventTypeSlug: string;
  hostEmail: string;
  attendeeEmail: string;
  attendeeName: string;
  attendeePhone?: string;
  scheduledFor: string;
  durationMinutes: number;
  notes?: string;
  location?: string;
  /** `zoom`, `google_meet`, or `none`. Defaults to none. */
  conference?: "zoom" | "google_meet" | "none";
  timezone?: string;
  /** When true, skip Calendar/Zoom/SMS side-effects. */
  silent?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  let calendarEventId: string | null = null;
  let calendarLink: string | null = null;
  let zoomJoinUrl: string | null = null;
  let zoomMeetingId: string | null = null;
  let smsSid: string | null = null;
  const sideEffectErrors: Record<string, string> = {};

  if (!body.silent) {
    const startIso = body.scheduledFor;
    const endIso = new Date(
      new Date(body.scheduledFor).getTime() + body.durationMinutes * 60_000,
    ).toISOString();

    // 1. Optional Zoom meeting
    if (body.conference === "zoom") {
      try {
        const zoom = await createZoomMeeting({
          topic: `${body.attendeeName} ↔ ${body.hostEmail}`,
          startTime: startIso,
          durationMinutes: body.durationMinutes,
          timezone: body.timezone ?? "UTC",
          agenda: body.notes ?? body.eventTypeSlug,
        });
        zoomJoinUrl = zoom.join_url;
        zoomMeetingId = String(zoom.id);
      } catch (err) {
        sideEffectErrors.zoom = (err as Error).message;
      }
    }

    // 2. Google Calendar event (with Meet link if requested and Zoom not used)
    try {
      const useMeet = body.conference === "google_meet" && !zoomJoinUrl;
      const calendarLocation =
        zoomJoinUrl ?? body.location ?? (useMeet ? undefined : "Virtual");
      const event = await createGCalEvent({
        summary: `${body.eventTypeSlug}: ${body.attendeeName}`,
        description: [
          body.notes,
          zoomJoinUrl ? `Zoom: ${zoomJoinUrl}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        location: calendarLocation,
        start: body.timezone
          ? { dateTime: startIso, timeZone: body.timezone }
          : { dateTime: startIso },
        end: body.timezone
          ? { dateTime: endIso, timeZone: body.timezone }
          : { dateTime: endIso },
        attendees: [
          { email: body.hostEmail },
          { email: body.attendeeEmail, displayName: body.attendeeName },
        ],
        extendedProperties: {
          private: {
            kitTenantId: tenantId,
            kitEventTypeSlug: body.eventTypeSlug,
          },
        },
        conferenceData: useMeet
          ? {
              createRequest: {
                requestId: `${tenantId}-${Date.now()}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            }
          : undefined,
        sendUpdates: "all",
      });
      calendarEventId = event.id;
      calendarLink = event.htmlLink;
      if (!zoomJoinUrl) {
        zoomJoinUrl = event.hangoutLink ?? null;
      }
    } catch (err) {
      sideEffectErrors.calendar = (err as Error).message;
    }
  }

  const created = await bookingRepository.create(tenantId, {
    eventTypeSlug: body.eventTypeSlug,
    hostEmail: body.hostEmail,
    attendeeEmail: body.attendeeEmail,
    attendeeName: body.attendeeName,
    attendeePhone: body.attendeePhone ?? null,
    scheduledFor: body.scheduledFor,
    durationMinutes: body.durationMinutes,
    status: "confirmed",
    canceledAt: null,
    cancelReason: null,
    notes: body.notes ?? null,
    location: body.location ?? null,
    calendarEventId,
    zoomMeetingId,
    zoomJoinUrl,
    createdAt: new Date().toISOString(),
  });

  // 3. Twilio confirmation SMS (only if attendee phone is supplied) — fire
  // after the booking is persisted so the caller's id appears in logs.
  if (!body.silent && body.attendeePhone) {
    try {
      const when = new Date(body.scheduledFor).toUTCString();
      const link = zoomJoinUrl ?? calendarLink ?? body.location ?? "";
      const text = `You're booked with ${body.hostEmail} on ${when} (${body.durationMinutes}m).${link ? ` Link: ${link}` : ""}`;
      const sms = await sendTwilioSms({ to: body.attendeePhone, body: text });
      smsSid = sms.sid;
    } catch (err) {
      sideEffectErrors.sms = (err as Error).message;
    }
  }

  return new Response(
    JSON.stringify({
      booking: created,
      calendarEventId,
      calendarLink,
      zoomJoinUrl,
      zoomMeetingId,
      smsSid,
      sideEffectErrors,
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
