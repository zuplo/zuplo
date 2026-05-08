import { environment } from "@zuplo/runtime";

/**
 * Datadog integration.
 *
 * Two responsibilities:
 *   1. Verify inbound webhook signatures from Datadog Monitors / Synthetic
 *      checks (HMAC SHA-256 over the body, header `x-datadog-signature`).
 *   2. (Outbound) Optionally post events to Datadog when evidence is
 *      collected, so the SOC2 auditor can correlate evidence to monitor
 *      runs without leaving Datadog.
 *
 * Docs:
 *   - https://docs.datadoghq.com/integrations/webhooks/
 *   - https://docs.datadoghq.com/api/latest/events/
 */

const EVENTS_API = "https://api.datadoghq.com/api/v1/events";

/**
 * Verify a Datadog webhook signature. Datadog sends `x-datadog-signature` as
 * a hex-encoded HMAC-SHA256 of the raw body using the secret you configured
 * on the webhook integration.
 */
export async function verifyDatadogWebhook(
  request: Request,
  rawBody: string,
): Promise<boolean> {
  const secret = environment.DATADOG_WEBHOOK_SECRET;
  if (!secret) {
    return environment.NODE_ENV !== "production";
  }
  const provided = request.headers.get("x-datadog-signature");
  if (!provided) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(provided.trim(), expected);
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Datadog Monitor / Webhook event payload (subset of fields). Datadog lets
 * you template the body — the conventional shape used by the official
 * "Webhooks" integration is roughly this.
 */
export interface DatadogWebhookPayload {
  /** Unique alert id. */
  alertId?: string;
  alertType?: "error" | "warning" | "info" | "success" | "recovery";
  alertStatus?: "Triggered" | "Recovered" | "Re-Triggered";
  title?: string;
  body?: string;
  /** Monitor that fired. */
  monitorId?: number;
  monitorName?: string;
  /** Tags stamped on the alerting series. */
  tags?: string[];
  /** Triggering metric series name when applicable. */
  metricName?: string;
  /** Evaluation of the monitor at firing time. */
  metricValue?: number;
  /** Datadog-side event time (epoch seconds). */
  eventTime?: number;
}

export interface PostDatadogEventInput {
  title: string;
  text: string;
  alertType?: "error" | "warning" | "info" | "success";
  tags?: string[];
  /** Stable id for dedup if the same evidence is collected twice. */
  aggregationKey?: string;
}

/**
 * Post a Datadog event (e.g. "Evidence X collected for control Y"). Useful
 * for compliance dashboards / monitor-correlation.
 */
export async function postDatadogEvent(input: PostDatadogEventInput): Promise<{ id: number }> {
  const apiKey = environment.DATADOG_API_KEY;
  const appKey = environment.DATADOG_APP_KEY;
  if (!apiKey) throw new Error("DATADOG_API_KEY is not set");

  const url = environment.DATADOG_SITE
    ? `https://api.${environment.DATADOG_SITE}/api/v1/events`
    : EVENTS_API;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "DD-API-KEY": apiKey,
      ...(appKey ? { "DD-APPLICATION-KEY": appKey } : {}),
    },
    body: JSON.stringify({
      title: input.title,
      text: input.text,
      alert_type: input.alertType ?? "info",
      tags: input.tags,
      aggregation_key: input.aggregationKey,
    }),
  });
  if (!res.ok) {
    throw new Error(`Datadog event create failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { event: { id: number } };
  return { id: json.event.id };
}
