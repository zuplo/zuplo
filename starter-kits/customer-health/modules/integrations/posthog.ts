/**
 * PostHog integration — capture events and run insight queries.
 *
 * Two surfaces:
 *   - capturePostHogEvent: send a single event into /capture (no API key
 *     required when using the public project key)
 *   - queryPostHogHogql: run a HogQL query against /query for things like
 *     "weekly_active_users for distinct_id starts_with 'acme:'"
 *
 * Used by the customer-health kit to ingest usage signals from PostHog
 * (rather than rebuilding analytics from scratch) and to capture our own
 * health-recalculation events back into PostHog for downstream BI.
 *
 * Env:
 *   POSTHOG_HOST              Defaults to https://us.i.posthog.com.
 *                             Use https://eu.i.posthog.com for EU cloud.
 *   POSTHOG_PROJECT_API_KEY   `phc_...` — public project key for /capture
 *   POSTHOG_PERSONAL_API_KEY  `phx_...` — personal API key for /query
 *   POSTHOG_PROJECT_ID        Numeric project id; required for /query
 */

const DEFAULT_HOST = "https://us.i.posthog.com";

function host(): string {
  return process.env.POSTHOG_HOST?.replace(/\/$/, "") ?? DEFAULT_HOST;
}

export interface PostHogCaptureRequest {
  event: string;
  /** distinct_id — typically `${tenantId}:${userOrAccountId}`. */
  distinctId: string;
  properties?: Record<string, unknown>;
  timestamp?: string;
}

/** Capture one event in PostHog. */
export async function capturePostHogEvent(
  req: PostHogCaptureRequest,
): Promise<void> {
  const key = process.env.POSTHOG_PROJECT_API_KEY;
  if (!key) throw new Error("POSTHOG_PROJECT_API_KEY is not set");

  const res = await fetch(`${host()}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event: req.event,
      distinct_id: req.distinctId,
      properties: req.properties ?? {},
      timestamp: req.timestamp,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `PostHog capture failed: ${res.status} ${await res.text()}`,
    );
  }
}

export interface PostHogQueryResult {
  /** Raw rows: array-of-arrays. */
  results: unknown[][];
  /** Column names corresponding to each result row's array. */
  columns?: string[];
  /** Original HogQL the server actually ran. */
  hogql?: string;
}

/**
 * Run a HogQL query through the PostHog `/api/projects/{id}/query/` API.
 * https://posthog.com/docs/api/queries
 */
export async function queryPostHogHogql(
  hogql: string,
): Promise<PostHogQueryResult> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!key) throw new Error("POSTHOG_PERSONAL_API_KEY is not set");
  if (!projectId) throw new Error("POSTHOG_PROJECT_ID is not set");

  const res = await fetch(
    `${host()}/api/projects/${projectId}/query/`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: { kind: "HogQLQuery", query: hogql },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `PostHog query failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as PostHogQueryResult;
}
