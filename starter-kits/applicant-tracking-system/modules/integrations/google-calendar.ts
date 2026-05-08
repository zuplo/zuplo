import { environment } from "@zuplo/runtime";

/**
 * Google Calendar integration.
 *
 * Creates events on a Google Calendar via the v3 REST API
 * (https://developers.google.com/calendar/api/v3/reference/events/insert).
 * Uses an OAuth2 access token from GOOGLE_OAUTH_ACCESS_TOKEN — refreshing the
 * token is up to whatever issued it (e.g. a Zuplo policy or upstream service).
 *
 * Set sendUpdates: "all" so attendees get the calendar invite email.
 */

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface GoogleAttendee {
  email: string;
  displayName?: string;
  optional?: boolean;
}

export interface GoogleEventDateTime {
  /** RFC3339 timestamp e.g. "2026-06-14T10:00:00-07:00". */
  dateTime: string;
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timeZone?: string;
}

export interface CreateCalendarEventRequest {
  /** Calendar id ("primary" or a specific calendar id). Defaults to GOOGLE_CALENDAR_ID or "primary". */
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
  attendees?: GoogleAttendee[];
  /** When "all", every attendee gets an emailed calendar invite. */
  sendUpdates?: "all" | "externalOnly" | "none";
  /** Optional Google Meet conferencing — set requestId to enable. */
  conferenceRequestId?: string;
}

export interface CreateCalendarEventResponse {
  /** Google event id. */
  id: string;
  htmlLink: string;
  hangoutLink?: string;
  status: string;
}

interface RawGoogleEventResponse {
  id: string;
  htmlLink: string;
  hangoutLink?: string;
  status: string;
  conferenceData?: { entryPoints?: Array<{ uri?: string }> };
}

function envVar(name: string): string | undefined {
  return (environment as Record<string, string | undefined>)[name];
}

/**
 * Create a Google Calendar event on the configured calendar. Throws on
 * missing credentials or non-2xx response.
 */
export async function createCalendarEvent(
  req: CreateCalendarEventRequest,
): Promise<CreateCalendarEventResponse> {
  const accessToken = envVar("GOOGLE_OAUTH_ACCESS_TOKEN");
  if (!accessToken) throw new Error("GOOGLE_OAUTH_ACCESS_TOKEN is not set");
  const calendarId = encodeURIComponent(
    req.calendarId ?? envVar("GOOGLE_CALENDAR_ID") ?? "primary",
  );

  const params = new URLSearchParams();
  params.set("sendUpdates", req.sendUpdates ?? "all");
  if (req.conferenceRequestId) params.set("conferenceDataVersion", "1");

  const body: Record<string, unknown> = {
    summary: req.summary,
    description: req.description,
    location: req.location,
    start: req.start,
    end: req.end,
    attendees: req.attendees?.map((a) => ({
      email: a.email,
      displayName: a.displayName,
      optional: a.optional,
    })),
  };
  if (req.conferenceRequestId) {
    body.conferenceData = {
      createRequest: {
        requestId: req.conferenceRequestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const res = await fetch(
    `${CALENDAR_API}/calendars/${calendarId}/events?${params.toString()}`,
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
      `Google Calendar event insert failed: ${res.status} ${await res.text()}`,
    );
  }
  const data = (await res.json()) as RawGoogleEventResponse;
  return {
    id: data.id,
    htmlLink: data.htmlLink,
    hangoutLink:
      data.hangoutLink ??
      data.conferenceData?.entryPoints?.find((e) => e.uri)?.uri,
    status: data.status,
  };
}
