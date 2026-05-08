import { environment } from "@zuplo/runtime";

/**
 * Zoom integration.
 *
 * Creates Zoom meetings via the Zoom Meetings v2 API. Authenticates with
 * a server-to-server OAuth (S2S) app: the kit exchanges
 * `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, and `ZOOM_CLIENT_SECRET` for a
 * short-lived access token, then calls `/users/me/meetings` to create the
 * meeting and returns the join_url.
 *
 * Docs:
 *   https://developers.zoom.us/docs/internal-apps/s2s-oauth/
 *   https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#operation/meetingCreate
 */

const ZOOM_API = "https://api.zoom.us/v2";
const ZOOM_OAUTH = "https://zoom.us/oauth/token";

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

function envValue(name: string): string | undefined {
  return (environment as Record<string, string | undefined>)[name];
}

function requireEnv(name: string): string {
  const value = envValue(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * Get a server-to-server OAuth access token, cached in-process for its
 * declared lifetime minus a 60s grace window.
 */
export async function getZoomAccessToken(): Promise<string> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) {
    return cached.accessToken;
  }
  const accountId = requireEnv("ZOOM_ACCOUNT_ID");
  const clientId = requireEnv("ZOOM_CLIENT_ID");
  const clientSecret = requireEnv("ZOOM_CLIENT_SECRET");
  const basic = btoa(`${clientId}:${clientSecret}`);

  const params = new URLSearchParams({
    grant_type: "account_credentials",
    account_id: accountId,
  });
  const res = await fetch(`${ZOOM_OAUTH}?${params}`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
  });
  if (!res.ok) {
    throw new Error(`Zoom token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cached = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cached.accessToken;
}

export interface ZoomMeetingRequest {
  /** Topic shown to attendees in calendar invites and the Zoom UI. */
  topic: string;
  /** ISO-8601 start time. */
  startTime: string;
  /** Duration in minutes. */
  durationMinutes: number;
  /** IANA TZ — `America/Los_Angeles`. Defaults to UTC. */
  timezone?: string;
  /** Optional agenda. */
  agenda?: string;
  /** Generate a strong meeting password if one isn't provided. */
  password?: string;
  /** Schedule on behalf of a user other than `me`. Pass an email or userId. */
  hostUserId?: string;
}

export interface ZoomMeetingResponse {
  id: number;
  uuid: string;
  topic: string;
  start_time: string;
  duration: number;
  timezone: string;
  join_url: string;
  start_url: string;
  password?: string;
  host_email?: string;
}

/**
 * Create a scheduled Zoom meeting and return its details. Type 2 = scheduled
 * (Cal-style booking), as opposed to instant or recurring.
 */
export async function createZoomMeeting(
  req: ZoomMeetingRequest,
): Promise<ZoomMeetingResponse> {
  const token = await getZoomAccessToken();
  const userPart = req.hostUserId ?? "me";
  const url = `${ZOOM_API}/users/${encodeURIComponent(userPart)}/meetings`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      topic: req.topic,
      type: 2, // scheduled
      start_time: req.startTime,
      duration: req.durationMinutes,
      timezone: req.timezone ?? "UTC",
      agenda: req.agenda,
      password: req.password,
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
        mute_upon_entry: true,
        waiting_room: false,
        approval_type: 2, // no registration required
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Zoom create meeting failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ZoomMeetingResponse;
}

/**
 * Delete a Zoom meeting. Idempotent — a 404 is treated as success.
 */
export async function deleteZoomMeeting(meetingId: number | string): Promise<void> {
  const token = await getZoomAccessToken();
  const res = await fetch(`${ZOOM_API}/meetings/${encodeURIComponent(String(meetingId))}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Zoom delete meeting failed: ${res.status} ${await res.text()}`);
  }
}
