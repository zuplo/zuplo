import { environment } from "@zuplo/runtime";

/**
 * Google Workspace Admin SDK integration.
 *
 * Three things:
 *   1. Exchange an OAuth refresh token for a short-lived access token.
 *   2. List tenant users (Directory API) to enumerate seats.
 *   3. List apps the tenant has connected via OAuth (Reports API token usage)
 *      so we can auto-discover SaaS apps the company is paying for.
 *
 * Required scopes (admin SDK):
 *   - https://www.googleapis.com/auth/admin.directory.user.readonly
 *   - https://www.googleapis.com/auth/admin.reports.audit.readonly
 *
 * Docs:
 *   - https://developers.google.com/admin-sdk/directory/reference/rest
 *   - https://developers.google.com/admin-sdk/reports/v1/reference/activities
 */

const ADMIN_API = "https://admin.googleapis.com/admin";
const REPORTS_API = "https://admin.googleapis.com/admin/reports/v1";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: "Bearer";
  scope?: string;
}

/**
 * Exchange the configured refresh token for an access token. Cached only for
 * the lifetime of a single request — Zuplo runs short-lived workers so a
 * cross-request cache would need an external KV.
 */
export async function getGoogleAccessToken(): Promise<string> {
  const clientId = environment.GOOGLE_CLIENT_ID;
  const clientSecret = environment.GOOGLE_CLIENT_SECRET;
  const refreshToken = environment.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN are required",
    );
  }
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) {
    throw new Error(`Google OAuth token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as AccessTokenResponse;
  return json.access_token;
}

export interface GoogleDirectoryUser {
  id: string;
  primaryEmail: string;
  name: { fullName: string };
  suspended: boolean;
  isAdmin: boolean;
  lastLoginTime: string;
}

/**
 * List Google Workspace users for the tenant's primary domain. Pages through
 * results. Useful as a seat count baseline for the Workspace product itself.
 */
export async function listWorkspaceUsers(
  customer = "my_customer",
): Promise<GoogleDirectoryUser[]> {
  const accessToken = await getGoogleAccessToken();
  const users: GoogleDirectoryUser[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${ADMIN_API}/directory/v1/users`);
    url.searchParams.set("customer", customer);
    url.searchParams.set("maxResults", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Google directory users list failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      users?: GoogleDirectoryUser[];
      nextPageToken?: string;
    };
    users.push(...(json.users ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return users;
}

export interface GoogleOAuthApp {
  /** Client id of the third-party app the tenant authorised. */
  clientId: string;
  displayText: string;
  /** Number of distinct users who have consented. */
  userCount: number;
  /** Last time any user in the tenant authorised this app. */
  lastAuthorizedAt: string | null;
}

interface ActivityEvent {
  name: string;
  parameters?: Array<{ name: string; value?: string; intValue?: string }>;
}

interface ActivityItem {
  id: { time: string };
  events?: ActivityEvent[];
  actor?: { email?: string };
}

/**
 * Pull recent OAuth token grant activity from the Reports API and aggregate
 * by client_id. Each (client_id, displayText) pair becomes a candidate SaaS
 * app the company has at least one user logged into.
 *
 * @param days Look back this many days (Google retains ~6 months).
 */
export async function listOAuthAuthorizedApps(
  days = 30,
): Promise<GoogleOAuthApp[]> {
  const accessToken = await getGoogleAccessToken();
  const startTime = new Date(Date.now() - days * 86400000).toISOString();

  const apps = new Map<string, GoogleOAuthApp>();
  let pageToken: string | undefined;
  do {
    const url = new URL(`${REPORTS_API}/activity/users/all/applications/token`);
    url.searchParams.set("startTime", startTime);
    url.searchParams.set("maxResults", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Google reports/token activity failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      items?: ActivityItem[];
      nextPageToken?: string;
    };
    for (const item of json.items ?? []) {
      for (const event of item.events ?? []) {
        if (event.name !== "authorize") continue;
        let clientId = "";
        let displayText = "";
        for (const p of event.parameters ?? []) {
          if (p.name === "client_id") clientId = p.value ?? "";
          if (p.name === "app_name") displayText = p.value ?? "";
        }
        if (!clientId) continue;
        const existing = apps.get(clientId);
        if (existing) {
          existing.userCount += 1;
          if (!existing.lastAuthorizedAt || existing.lastAuthorizedAt < item.id.time) {
            existing.lastAuthorizedAt = item.id.time;
          }
        } else {
          apps.set(clientId, {
            clientId,
            displayText: displayText || clientId,
            userCount: 1,
            lastAuthorizedAt: item.id.time,
          });
        }
      }
    }
    pageToken = json.nextPageToken;
  } while (pageToken);

  return Array.from(apps.values()).sort((a, b) => b.userCount - a.userCount);
}
