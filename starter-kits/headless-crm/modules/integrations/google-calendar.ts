/**
 * Google Calendar integration — list/create events for a CRM contact.
 *
 * Uses the Google Calendar v3 REST API directly. No SDK; just a Bearer
 * access token from env. Token refresh / OAuth dance is upstream — set
 * GOOGLE_CALENDAR_ACCESS_TOKEN to a current access_token.
 *
 * Env:
 *   GOOGLE_CALENDAR_ACCESS_TOKEN   OAuth2 access token with calendar scope
 *   GOOGLE_CALENDAR_ID             Default calendar id (e.g. "primary")
 */

const CAL_API = "https://www.googleapis.com/calendar/v3";

export interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  htmlLink?: string;
  hangoutLink?: string;
}

export interface GCalListEventsRequest {
  /** Calendar id; defaults to GOOGLE_CALENDAR_ID env. */
  calendarId?: string;
  /** RFC3339 lower bound. */
  timeMin?: string;
  /** RFC3339 upper bound. */
  timeMax?: string;
  /** Filter by attendee email. */
  attendeeEmail?: string;
  /** Free-text search across event fields. */
  q?: string;
  maxResults?: number;
}

export interface GCalCreateEventRequest {
  calendarId?: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  timeZone?: string;
  attendees?: Array<{ email: string; displayName?: string }>;
}

function authHeader(): string {
  const token = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  if (!token) throw new Error("GOOGLE_CALENDAR_ACCESS_TOKEN is not set");
  return `Bearer ${token}`;
}

function calId(override?: string): string {
  return override ?? process.env.GOOGLE_CALENDAR_ID ?? "primary";
}

/** List events on a calendar within a time window. */
export async function listGCalEvents(
  req: GCalListEventsRequest = {},
): Promise<GCalEvent[]> {
  const qs = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(req.maxResults ?? 50),
  });
  if (req.timeMin) qs.set("timeMin", req.timeMin);
  if (req.timeMax) qs.set("timeMax", req.timeMax);
  if (req.q) qs.set("q", req.q);

  const url = `${CAL_API}/calendars/${encodeURIComponent(calId(req.calendarId))}/events?${qs}`;
  const res = await fetch(url, {
    headers: { authorization: authHeader() },
  });
  if (!res.ok) {
    throw new Error(
      `Google Calendar list failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { items: GCalEvent[] };
  let items = json.items ?? [];
  if (req.attendeeEmail) {
    const target = req.attendeeEmail.toLowerCase();
    items = items.filter((e) =>
      e.attendees?.some((a) => a.email.toLowerCase() === target),
    );
  }
  return items;
}

/** Create a new event on a calendar. */
export async function createGCalEvent(
  req: GCalCreateEventRequest,
): Promise<GCalEvent> {
  const url = `${CAL_API}/calendars/${encodeURIComponent(calId(req.calendarId))}/events`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: authHeader(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      summary: req.summary,
      description: req.description,
      start: { dateTime: req.start, timeZone: req.timeZone ?? "UTC" },
      end: { dateTime: req.end, timeZone: req.timeZone ?? "UTC" },
      attendees: req.attendees,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Google Calendar create failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as GCalEvent;
}
