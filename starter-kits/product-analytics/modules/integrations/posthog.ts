import { environment } from "@zuplo/runtime";

/**
 * PostHog integration — used by the product-analytics kit as a fan-out
 * target so events ingested through the kit also land in PostHog. Existing
 * PostHog dashboards, funnels, cohorts, and experiments keep working with
 * zero migration; the kit is "the API in front of PostHog" plus a
 * tenant-scoped multi-tenant layer of your own.
 *
 * Env vars:
 *   POSTHOG_API_HOST         — default https://us.i.posthog.com
 *   POSTHOG_API_KEY          — phc_... (project key, used by /capture)
 *   POSTHOG_PERSONAL_API_KEY — phx_... (used by /api/projects/.../query)
 *   POSTHOG_PROJECT_ID       — required for /query
 */

export interface PostHogIdentifyRequest {
  distinctId: string;
  /** Person properties to set. */
  properties?: Record<string, unknown>;
  /** $set_once properties (only applied first time). */
  setOnce?: Record<string, unknown>;
}

export interface PostHogCaptureRequest {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
  /** ISO timestamp; defaults to now. */
  timestamp?: string;
}

export interface PostHogBatchRequest {
  events: Array<{
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
    timestamp?: string;
  }>;
}

export interface PostHogQueryRequest {
  /** A HogQL string. */
  hogql: string;
  /** Optional bound parameters, referenced as {paramName} inside the query. */
  parameters?: Record<string, unknown>;
}

export interface PostHogQueryResponse {
  results: unknown[][];
  columns: string[];
  types?: string[];
  hogql?: string;
}

function host(): string {
  return (
    (environment as Record<string, string | undefined>).POSTHOG_API_HOST ??
    "https://us.i.posthog.com"
  ).replace(/\/$/, "");
}

function projectKey(): string {
  const key = (environment as Record<string, string | undefined>).POSTHOG_API_KEY;
  if (!key) throw new Error("POSTHOG_API_KEY is not set");
  return key;
}

function personalKey(): string {
  const key = (environment as Record<string, string | undefined>)
    .POSTHOG_PERSONAL_API_KEY;
  if (!key) throw new Error("POSTHOG_PERSONAL_API_KEY is not set (needed for /query)");
  return key;
}

function projectId(): string {
  const id = (environment as Record<string, string | undefined>).POSTHOG_PROJECT_ID;
  if (!id) throw new Error("POSTHOG_PROJECT_ID is not set (needed for /query)");
  return id;
}

/**
 * Capture a single event in PostHog. Used as a best-effort fan-out from
 * the kit's ingest_event handler.
 */
export async function capturePostHogEvent(
  req: PostHogCaptureRequest,
): Promise<void> {
  const res = await fetch(`${host()}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: projectKey(),
      event: req.event,
      distinct_id: req.distinctId,
      timestamp: req.timestamp ?? new Date().toISOString(),
      properties: req.properties ?? {},
    }),
  });
  if (!res.ok) {
    throw new Error(`PostHog capture failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Batch-capture events. PostHog's /batch/ endpoint accepts up to ~250
 * events per call; callers should chunk if needed.
 */
export async function capturePostHogBatch(
  req: PostHogBatchRequest,
): Promise<void> {
  if (req.events.length === 0) return;
  const res = await fetch(`${host()}/batch/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: projectKey(),
      batch: req.events.map((e) => ({
        event: e.event,
        distinct_id: e.distinctId,
        timestamp: e.timestamp ?? new Date().toISOString(),
        properties: e.properties ?? {},
      })),
    }),
  });
  if (!res.ok) {
    throw new Error(`PostHog batch failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Identify a user in PostHog (sets person properties on the distinct id).
 */
export async function identifyPostHogPerson(
  req: PostHogIdentifyRequest,
): Promise<void> {
  await capturePostHogEvent({
    distinctId: req.distinctId,
    event: "$identify",
    properties: {
      $set: req.properties,
      $set_once: req.setOnce,
    },
  });
}

/**
 * Run a HogQL query against the project's events. Used by the
 * `define_funnel_from_question` orchestrator to back its funnel
 * proposals against real event volumes.
 */
export async function runPostHogQuery(
  req: PostHogQueryRequest,
): Promise<PostHogQueryResponse> {
  const res = await fetch(
    `${host()}/api/projects/${encodeURIComponent(projectId())}/query/`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${personalKey()}`,
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query: req.hogql,
          values: req.parameters,
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`PostHog query failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    results: unknown[][];
    columns: string[];
    types?: string[];
    hogql?: string;
  };
  return {
    results: body.results,
    columns: body.columns,
    types: body.types,
    hogql: body.hogql,
  };
}
