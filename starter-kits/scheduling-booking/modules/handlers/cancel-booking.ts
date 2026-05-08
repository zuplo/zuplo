import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { bookingRepository, cancellationRepository } from "../repositories/bookings.ts";
import { deleteGCalEvent } from "../integrations/google-calendar.ts";
import { deleteZoomMeeting } from "../integrations/zoom.ts";
import { sendTwilioSms } from "../integrations/twilio.ts";

interface Body {
  reason?: string;
  canceledBy?: string;
  /** When true, skip Calendar/Zoom/SMS side-effects. */
  silent?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json().catch(() => ({}))) as Body;
  const now = new Date().toISOString();
  const reason = body.reason ?? "";
  const canceledBy = body.canceledBy ?? "system";

  try {
    const before = await bookingRepository.get(tenantId, id);
    if (!before) {
      throw new NotFoundError(`Booking ${id} not found`);
    }

    const updated = await bookingRepository.update(tenantId, id, {
      status: "canceled",
      canceledAt: now,
      cancelReason: reason,
    });

    // Audit row — keeps history even if the booking is later mutated.
    await cancellationRepository.create(tenantId, {
      bookingId: id,
      canceledBy,
      reason,
      canceledAt: now,
      createdAt: now,
    });

    const sideEffectErrors: Record<string, string> = {};

    if (!body.silent) {
      if (before.calendarEventId) {
        try {
          await deleteGCalEvent(before.calendarEventId, { sendUpdates: "all" });
        } catch (err) {
          sideEffectErrors.calendar = (err as Error).message;
        }
      }
      if (before.zoomMeetingId) {
        try {
          await deleteZoomMeeting(before.zoomMeetingId);
        } catch (err) {
          sideEffectErrors.zoom = (err as Error).message;
        }
      }
      if (before.attendeePhone) {
        try {
          const when = new Date(before.scheduledFor).toUTCString();
          await sendTwilioSms({
            to: before.attendeePhone,
            body: `Your meeting with ${before.hostEmail} on ${when} has been canceled${reason ? ` — ${reason}` : "."}`,
          });
        } catch (err) {
          sideEffectErrors.sms = (err as Error).message;
        }
      }
    }

    return new Response(
      JSON.stringify({ booking: updated, sideEffectErrors }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: err.message } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }
}
