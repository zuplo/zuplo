import { environment } from "@zuplo/runtime";

/**
 * PostHog integration — used by the ab-testing-flags kit as a backing store
 * for feature flag delivery and as an event capture target so existing
 * PostHog dashboards keep working.
 *
 * Two distinct credentials, intentionally:
 *   POSTHOG_API_KEY          — project key (phc_...). Used by /capture and
 *                              /decide. Safe to ship to clients.
 *   POSTHOG_PERSONAL_API_KEY — personal key (phx_...). Required for the
 *                              /api/projects/:id/query endpoint (HogQL).
 *
 * Optional:
 *   POSTHOG_API_HOST         — default https://us.i.posthog.com (use
 *                              https://eu.i.posthog.com for EU cloud, or
 *                              your self-host base URL).
 *   POSTHOG_PROJECT_ID       — required for /query.
 */

export interface PostHogCaptureRequest {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
  /** ISO timestamp; defaults to now. */
  timestamp?: string;
  /** Override $groups for B2B-style group analytics. */
  groups?: Record<string, string>;
}

export interface PostHogDecideRequest {
  distinctId: string;
  /** Optional groups (e.g. { company: "acme" }) for group-based flag rollouts. */
  groups?: Record<string, string>;
  /** Optional person properties for property-based targeting. */
  personProperties?: Record<string, unknown>;
  /** Optional group properties keyed by group type. */
  groupProperties?: Record<string, Record<string, unknown>>;
}

export interface PostHogDecideResponse {
  /** Map of flag key -> variant value (string for multivariate, true/false for boolean). */
  featureFlags: Record<string, string | boolean>;
  /** Map of flag key -> JSON payload, when configured in PostHog. */
  featureFlagPayloads?: Record<string, unknown>;
  /** PostHog signals when the request should be retried (e.g. config still loading). */
  errorsWhileComputingFlags?: boolean;
}

export interface PostHogQueryRequest {
  /** A HogQL string. PostHog's SQL dialect over event tables. */
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
 * Fire-and-forget event capture. Used as a fan-out target from `record_event`
 * so existing PostHog dashboards / experiments / cohorts keep working.
 */
export async function capturePostHogEvent(req: PostHogCaptureRequest): Promise<void> {
  const res = await fetch(`${host()}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: projectKey(),
      event: req.event,
      distinct_id: req.distinctId,
      timestamp: req.timestamp ?? new Date().toISOString(),
      properties: {
        ...req.properties,
        ...(req.groups ? { $groups: req.groups } : {}),
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`PostHog capture failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Resolve every active flag for a user via PostHog's /decide endpoint.
 * This is what the ab-testing-flags kit uses to back its `/v1/flags/{key}/decide`
 * route when a flag is registered with PostHog as the source of truth.
 */
export async function decidePostHogFlags(
  req: PostHogDecideRequest,
): Promise<PostHogDecideResponse> {
  const res = await fetch(`${host()}/decide/?v=3`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: projectKey(),
      distinct_id: req.distinctId,
      groups: req.groups ?? {},
      person_properties: req.personProperties ?? {},
      group_properties: req.groupProperties ?? {},
    }),
  });
  if (!res.ok) {
    throw new Error(`PostHog decide failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    featureFlags?: Record<string, string | boolean>;
    featureFlagPayloads?: Record<string, unknown>;
    errorsWhileComputingFlags?: boolean;
  };
  return {
    featureFlags: body.featureFlags ?? {},
    featureFlagPayloads: body.featureFlagPayloads,
    errorsWhileComputingFlags: body.errorsWhileComputingFlags,
  };
}

/**
 * Run a HogQL query against the project's events. Used by analytics /
 * funnel tools that want to ask "what's variant X's conversion rate over
 * the last 7 days?" directly from ClickHouse-backed event data.
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

/**
 * Convenience: register the kit's experiment as a PostHog feature flag so
 * a single flag drives both the kit's /assignment endpoint and PostHog's
 * /decide endpoint. Uses the Feature Flag REST API. Idempotent on `key`.
 */
export async function upsertPostHogFlag(args: {
  key: string;
  name: string;
  variants: Array<{ key: string; rolloutPercentage: number }>;
  active?: boolean;
}): Promise<{ id: number; key: string }> {
  const url = `${host()}/api/projects/${encodeURIComponent(projectId())}/feature_flags/`;
  // Look up by key first.
  const lookup = await fetch(`${url}?search=${encodeURIComponent(args.key)}`, {
    headers: { authorization: `Bearer ${personalKey()}` },
  });
  if (!lookup.ok) {
    throw new Error(`PostHog flag lookup failed: ${lookup.status} ${await lookup.text()}`);
  }
  const lookupBody = (await lookup.json()) as { results: Array<{ id: number; key: string }> };
  const existing = lookupBody.results.find((f) => f.key === args.key);

  const payload = {
    key: args.key,
    name: args.name,
    active: args.active ?? true,
    filters: {
      groups: [
        {
          properties: [],
          rollout_percentage: 100,
        },
      ],
      multivariate: {
        variants: args.variants.map((v) => ({
          key: v.key,
          name: v.key,
          rollout_percentage: v.rolloutPercentage,
        })),
      },
    },
  };

  const res = await fetch(existing ? `${url}${existing.id}/` : url, {
    method: existing ? "PATCH" : "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${personalKey()}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(
      `PostHog flag ${existing ? "update" : "create"} failed: ${res.status} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { id: number; key: string };
  return body;
}
