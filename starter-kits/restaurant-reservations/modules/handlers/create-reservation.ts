import { environment, type ZuploContext, type ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  reservationRepository,
  type Reservation,
} from "../repositories/reservations.ts";
import { guestRepository } from "../repositories/guests.ts";
import { sendTwilioSms } from "../integrations/twilio.ts";
import { createGoogleCalendarEvent } from "../integrations/google-calendar.ts";
import { createStripeCheckoutSession } from "../integrations/stripe.ts";

interface Body {
  guestId: string;
  scheduledFor: string;
  partySize: number;
  durationMinutes?: number;
  tableId?: string;
  specialRequests?: string;
  source?: Reservation["source"];
  /** When > 0, mints a Stripe Checkout session for a deposit and returns the URL. */
  depositCents?: number;
  /** Where Stripe Checkout redirects on success. */
  depositSuccessUrl?: string;
  /** Where Stripe Checkout redirects on cancel. */
  depositCancelUrl?: string;
}

/**
 * POST /reservations — book a reservation.
 *
 * 1. Persist the Reservation in `confirmed` state.
 * 2. Create a Google Calendar event on the restaurant's shared calendar.
 * 3. If `depositCents > 0`, mint a Stripe Checkout Session for the deposit.
 * 4. SMS the guest a confirmation (with deposit link if applicable).
 *
 * Each integration is best-effort: missing env vars or transient errors
 * don't fail the booking, they just degrade silently and log.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const now = new Date().toISOString();
  const durationMinutes = body.durationMinutes ?? 90;

  let reservation = await reservationRepository.create(tenantId, {
    guestId: body.guestId,
    scheduledFor: body.scheduledFor,
    partySize: body.partySize,
    durationMinutes,
    tableId: body.tableId ?? null,
    status: "confirmed",
    specialRequests: body.specialRequests ?? null,
    source: body.source ?? "web",
    confirmedAt: now,
    seatedAt: null,
    completedAt: null,
    createdAt: now,
    calendarEventId: null,
    depositSessionId: null,
    depositUrl: null,
    depositStatus: body.depositCents && body.depositCents > 0 ? "pending" : "none",
    depositCents: body.depositCents ?? 0,
  });

  const guest = await guestRepository.get(tenantId, body.guestId);
  const guestName = guest
    ? `${guest.firstName} ${guest.lastName}`.trim()
    : "Guest";
  const restaurantName = environment.RESTAURANT_NAME ?? "the restaurant";
  const startMs = Date.parse(body.scheduledFor);
  const endIso = new Date(startMs + durationMinutes * 60_000).toISOString();

  // 1. Google Calendar.
  if (environment.GOOGLE_ACCESS_TOKEN && environment.GOOGLE_CALENDAR_ID) {
    try {
      const event = await createGoogleCalendarEvent({
        calendarId: environment.GOOGLE_CALENDAR_ID,
        summary: `${guestName} (${body.partySize}) — ${restaurantName}`,
        description: [
          `Party: ${body.partySize}`,
          `Source: ${body.source ?? "web"}`,
          body.specialRequests ? `Notes: ${body.specialRequests}` : null,
          guest?.allergies?.length ? `Allergies: ${guest.allergies.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        start: body.scheduledFor,
        end: endIso,
        timeZone: environment.RESTAURANT_TIMEZONE ?? "America/Los_Angeles",
        attendees: guest?.email ? [{ email: guest.email, displayName: guestName }] : undefined,
        extendedProperties: {
          private: {
            reservationId: reservation.id,
            tenantId,
          },
        },
      });
      reservation = await reservationRepository.update(tenantId, reservation.id, {
        calendarEventId: event.id,
      });
    } catch (err) {
      context.log.warn(
        `Google Calendar sync failed for reservation ${reservation.id}: ${
          (err as Error).message
        }`,
      );
    }
  }

  // 2. Stripe Checkout deposit.
  let depositUrl: string | null = null;
  if (
    body.depositCents &&
    body.depositCents > 0 &&
    environment.STRIPE_SECRET_KEY &&
    body.depositSuccessUrl &&
    body.depositCancelUrl &&
    guest?.email
  ) {
    try {
      const session = await createStripeCheckoutSession({
        amountCents: body.depositCents,
        currency: environment.RESTAURANT_CURRENCY ?? "USD",
        description: `Reservation deposit — ${restaurantName} ${body.scheduledFor}`,
        customerEmail: guest.email,
        successUrl: body.depositSuccessUrl,
        cancelUrl: body.depositCancelUrl,
        metadata: {
          reservation_id: reservation.id,
          tenant_id: tenantId,
        },
      });
      depositUrl = session.url;
      reservation = await reservationRepository.update(tenantId, reservation.id, {
        depositSessionId: session.id,
        depositUrl,
      });
    } catch (err) {
      context.log.warn(
        `Stripe deposit session failed for reservation ${reservation.id}: ${
          (err as Error).message
        }`,
      );
    }
  }

  // 3. Twilio SMS confirmation.
  if (
    environment.TWILIO_ACCOUNT_SID &&
    environment.TWILIO_AUTH_TOKEN &&
    environment.TWILIO_FROM_NUMBER &&
    guest?.phone
  ) {
    const when = new Date(body.scheduledFor).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const lines = [
      `${restaurantName}: ${guestName}, your table for ${body.partySize} is confirmed for ${when}.`,
    ];
    if (depositUrl) {
      lines.push(
        `A deposit is required to hold your booking: ${depositUrl}`,
      );
    }
    if (body.specialRequests) {
      lines.push(`We've noted: ${body.specialRequests}`);
    }
    await sendTwilioSms({
      to: guest.phone,
      body: lines.join("\n"),
    }).catch((err) =>
      context.log.warn(
        `Twilio confirmation SMS failed for reservation ${reservation.id}: ${
          (err as Error).message
        }`,
      ),
    );
  }

  return new Response(JSON.stringify(reservation), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
