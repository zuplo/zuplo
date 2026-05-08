import { environment } from "@zuplo/runtime";

/**
 * Google Calendar integration.
 *
 * Creates, lists, and deletes events on a Google Calendar via the
 * Calendar v3 REST API. Authenticates with an OAuth2 access token from
 * `GOOGLE_CALENDAR_ACCESS_TOKEN`. Refreshing tokens is the host app's
 * responsibility — pass a fresh access token in via env each deploy, or
 * fetch one from a token endpoint and override at the call site.
 *
 * Docs: https://developers.google.com/calendar/api/v3/reference
 */

const GCAL_API = "https://www.googleapis.com/calendar/v3";

export interface GCalEventDateTime {
  /** ISO-8601 timestamp, e.g. `2025-08-12T15:00:00-07:00`. */
  dateTime?: string;
  /** All-day events use `date` instead, e.g. `2025-08-12`. */
  date?: string;
  /** IANA TZ — `America/Los_Angeles`. */
  timeZone?: string;
}

export interface GCalAttendee {
  email: string;
  displayName?: string;
  optional?: boolean;
}

export interface GCalEventRequest {
  /** Defaults to env `GOOGLE_CALENDAR_ID` or the literal `primary`. */
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  start: GCalEventDateTime;
  end: GCalEventDateTime;
  attendees?: GCalAttendee[];
  /** Free-form key/value pairs stored on the event. */
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
  /** When set, Google will create a Meet link automatically. */
  conferenceData?: {
    createRequest: {
      requestId: string;
      conferenceSolutionKey?: { type: "hangoutsMeet" };
    };
  };
  /** Send invitations to attendees: `all` | `externalOnly` | `none`. */
  sendUpdates?: "all" | "externalOnly" | "none";
}

export interface GCalEvent {
  id: string;
  htmlLink: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GCalEventDateTime;
  end?: GCalEventDateTime;
  attendees?: GCalAttendee[];
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ uri: string; entryPointType: string }>;
  };
  status?: string;
  iCalUID?: string;
  created?: string;
  updated?: string;
}

function envValue(name: string): string | undefined {
  return (environment as Record<string, string | undefined>)[name];
}

function requireToken(): string {
  const token = envValue("GOOGLE_CALENDAR_ACCESS_TOKEN");
  if (!token) {
    throw new Error("GOOGLE_CALENDAR_ACCESS_TOKEN is not set");
  }
  return token;
}

function defaultCalendarId(): string {
  return envValue("GOOGLE_CALENDAR_ID") ?? "primary";
}

/**
 * Create an event on a calendar. Returns the created event with its
 * Google-assigned id, htmlLink, and (optionally) hangoutLink.
 */
export async function createGCalEvent(
  req: GCalEventRequest,
): Promise<GCalEvent> {
  const calendarId = req.calendarId ?? defaultCalendarId();
  const params = new URLSearchParams();
  if (req.sendUpdates) params.set("sendUpdates", req.sendUpdates);
  if (req.conferenceData) params.set("conferenceDataVersion", "1");
  const qs = params.toString() ? `?${params}` : "";
  const url = `${GCAL_API}/calendars/${encodeURIComponent(calendarId)}/events${qs}`;

  const body: Record<string, unknown> = {
    summary: req.summary,
    description: req.description,
    location: req.location,
    start: req.start,
    end: req.end,
    attendees: req.attendees,
    extendedProperties: req.extendedProperties,
    conferenceData: req.conferenceData,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${requireToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `Google Calendar create event failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as GCalEvent;
}

/**
 * Patch an event in place — partial update of mutable fields.
 */
export async function updateGCalEvent(
  eventId: string,
  patch: Partial<GCalEventRequest>,
): Promise<GCalEvent> {
  const calendarId = patch.calendarId ?? defaultCalendarId();
  const params = new URLSearchParams();
  if (patch.sendUpdates) params.set("sendUpdates", patch.sendUpdates);
  const qs = params.toString() ? `?${params}` : "";
  const url = `${GCAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}${qs}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${requireToken()}`,
    },
    body: JSON.stringify({
      summary: patch.summary,
      description: patch.description,
      location: patch.location,
      start: patch.start,
      end: patch.end,
      attendees: patch.attendees,
      extendedProperties: patch.extendedProperties,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Google Calendar update event failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as GCalEvent;
}

/**
 * Delete an event. Idempotent — a 410 response is treated as success.
 */
export async function deleteGCalEvent(
  eventId: string,
  options: { calendarId?: string; sendUpdates?: "all" | "externalOnly" | "none" } = {},
): Promise<void> {
  const calendarId = options.calendarId ?? defaultCalendarId();
  const params = new URLSearchParams();
  if (options.sendUpdates) params.set("sendUpdates", options.sendUpdates);
  const qs = params.toString() ? `?${params}` : "";
  const url = `${GCAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}${qs}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { authorization: `Bearer ${requireToken()}` },
  });
  if (!res.ok && res.status !== 410) {
    throw new Error(
      `Google Calendar delete event failed: ${res.status} ${await res.text()}`,
    );
  }
}

/**
 * List events on a calendar in a time range.
 */
export async function listGCalEvents(options: {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  q?: string;
  maxResults?: number;
}): Promise<GCalEvent[]> {
  const calendarId = options.calendarId ?? defaultCalendarId();
  const params = new URLSearchParams();
  params.set("singleEvents", "true");
  params.set("orderBy", "startTime");
  if (options.timeMin) params.set("timeMin", options.timeMin);
  if (options.timeMax) params.set("timeMax", options.timeMax);
  if (options.q) params.set("q", options.q);
  if (options.maxResults) params.set("maxResults", String(options.maxResults));
  const url = `${GCAL_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${requireToken()}` },
  });
  if (!res.ok) {
    throw new Error(
      `Google Calendar list events failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { items?: GCalEvent[] };
  return json.items ?? [];
}
