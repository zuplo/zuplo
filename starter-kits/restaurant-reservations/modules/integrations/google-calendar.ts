import { environment } from "@zuplo/runtime";

/**
 * Google Calendar API integration.
 *
 * Used by the restaurant-reservations kit to add a booking to the
 * restaurant's shared Google Calendar (so the floor manager sees
 * tonight's covers in the same calendar everyone else uses).
 *
 * The kit assumes you've configured a Google service-account or OAuth
 * client that minted an access token upstream — the token lives in
 * `GOOGLE_ACCESS_TOKEN`. Zuplo's edge runtime doesn't refresh tokens;
 * point this at a small refresher (Cloud Run, Workers cron) and write
 * the latest token here.
 *
 * Docs: https://developers.google.com/calendar/api/v3/reference/events
 */

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface GoogleCalendarCreateEventRequest {
  /** Calendar id. "primary" for the authenticated user's calendar. */
  calendarId: string;
  summary: string;
  description?: string;
  /** Start time, e.g. "2026-08-12T19:00:00-07:00". */
  start: string;
  /** End time. */
  end: string;
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timeZone?: string;
  attendees?: Array<{ email: string; displayName?: string }>;
  /** Free-form metadata stored on the event. */
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
}

export interface GoogleCalendarEvent {
  id: string;
  status: string;
  htmlLink: string;
  start: { dateTime?: string; timeZone?: string };
  end: { dateTime?: string; timeZone?: string };
  summary: string;
}

/**
 * Insert a calendar event.
 */
export async function createGoogleCalendarEvent(
  req: GoogleCalendarCreateEventRequest,
): Promise<GoogleCalendarEvent> {
  const accessToken = environment.GOOGLE_ACCESS_TOKEN;
  if (!accessToken) throw new Error("GOOGLE_ACCESS_TOKEN is not set");

  const body = {
    summary: req.summary,
    description: req.description,
    start: { dateTime: req.start, timeZone: req.timeZone },
    end: { dateTime: req.end, timeZone: req.timeZone },
    attendees: req.attendees,
    extendedProperties: req.extendedProperties,
  };

  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(req.calendarId)}/events`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Google Calendar event creation failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as GoogleCalendarEvent;
}

/**
 * Cancel a calendar event (used when a reservation is canceled or no-showed).
 */
export async function deleteGoogleCalendarEvent(
  calendarId: string,
  eventId: string,
): Promise<void> {
  const accessToken = environment.GOOGLE_ACCESS_TOKEN;
  if (!accessToken) throw new Error("GOOGLE_ACCESS_TOKEN is not set");

  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );

  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(
      `Google Calendar event delete failed: ${res.status} ${await res.text()}`,
    );
  }
}
