import { environment } from "@zuplo/runtime";

/**
 * Okta integration.
 *
 * Uses an Okta API token (SSWS scheme) — simpler than full OAuth and the
 * canonical pattern for org-level admin reads.
 *
 * Provides:
 *   1. List active users — seat baseline for Okta itself.
 *   2. List apps assigned to the org plus per-app user counts — the
 *      authoritative shadow-IT source, since Okta sees every SSO login.
 *
 * Required Okta admin role: at least `Read-Only Admin`.
 *
 * Docs:
 *   - https://developer.okta.com/docs/reference/api/users
 *   - https://developer.okta.com/docs/reference/api/apps
 */

function oktaBase(): string {
  const domain = environment.OKTA_ORG_URL;
  if (!domain) throw new Error("OKTA_ORG_URL is not set (e.g. https://example.okta.com)");
  return domain.replace(/\/+$/, "");
}

function oktaHeaders(): Record<string, string> {
  const token = environment.OKTA_API_TOKEN;
  if (!token) throw new Error("OKTA_API_TOKEN is not set");
  return {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `SSWS ${token}`,
  };
}

/** Parse the `next` link from an Okta `Link:` response header. */
function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

export interface OktaUser {
  id: string;
  status: string;
  profile: { email: string; firstName?: string; lastName?: string };
  lastLogin: string | null;
  created: string;
}

/** List active Okta users (paginated). */
export async function listOktaUsers(): Promise<OktaUser[]> {
  const users: OktaUser[] = [];
  let url: string | null = `${oktaBase()}/api/v1/users?filter=status eq "ACTIVE"&limit=200`;
  while (url) {
    const res = await fetch(url, { headers: oktaHeaders() });
    if (!res.ok) {
      throw new Error(`Okta users list failed: ${res.status} ${await res.text()}`);
    }
    const page = (await res.json()) as OktaUser[];
    users.push(...page);
    url = parseNextLink(res.headers.get("link"));
  }
  return users;
}

export interface OktaApp {
  id: string;
  name: string;
  label: string;
  status: string;
  signOnMode: string;
  /** Populated by listOktaApps() once user counts are fetched. */
  assignedUserCount: number;
}

/** List active Okta apps (paginated). */
export async function listOktaApps(): Promise<OktaApp[]> {
  const apps: OktaApp[] = [];
  let url: string | null = `${oktaBase()}/api/v1/apps?filter=status eq "ACTIVE"&limit=200`;
  while (url) {
    const res = await fetch(url, { headers: oktaHeaders() });
    if (!res.ok) {
      throw new Error(`Okta apps list failed: ${res.status} ${await res.text()}`);
    }
    const page = (await res.json()) as OktaApp[];
    for (const app of page) apps.push({ ...app, assignedUserCount: 0 });
    url = parseNextLink(res.headers.get("link"));
  }
  return apps;
}

/**
 * For each app, count assigned users. Issues one HEAD-equivalent per app —
 * reasonable for ~100 apps, paginates inside if necessary.
 */
export async function countAppUsers(appId: string): Promise<number> {
  let total = 0;
  let url: string | null = `${oktaBase()}/api/v1/apps/${encodeURIComponent(appId)}/users?limit=200`;
  while (url) {
    const res = await fetch(url, { headers: oktaHeaders() });
    if (!res.ok) {
      throw new Error(`Okta app users list failed: ${res.status} ${await res.text()}`);
    }
    const page = (await res.json()) as unknown[];
    total += page.length;
    url = parseNextLink(res.headers.get("link"));
  }
  return total;
}

/** Convenience: list apps with their user counts populated. */
export async function listOktaAppsWithUserCounts(): Promise<OktaApp[]> {
  const apps = await listOktaApps();
  for (const app of apps) {
    app.assignedUserCount = await countAppUsers(app.id);
  }
  return apps;
}
