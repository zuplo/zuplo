import { environment } from "@zuplo/runtime";

/**
 * PagerDuty integration.
 *
 * Two responsibilities:
 *   1. Verify inbound webhook signatures (PagerDuty signs payloads with HMAC
 *      SHA-256 in the `x-pagerduty-signature` header).
 *   2. Trigger / acknowledge / resolve incidents via the Events API v2 from
 *      our orchestrators when needed.
 *
 * Docs:
 *   - https://developer.pagerduty.com/docs/db0fa8c8984fc-overview
 *   - https://developer.pagerduty.com/docs/events-api-v2-overview
 */

const EVENTS_V2 = "https://events.pagerduty.com/v2/enqueue";

export interface PagerDutyWebhookEvent {
  /** PagerDuty webhook envelope. */
  event: {
    id: string;
    event_type: string;
    resource_type: string;
    occurred_at: string;
    agent: { id: string; type: string };
    client?: { name: string };
    data: PagerDutyIncident;
  };
}

export interface PagerDutyIncident {
  id: string;
  type: "incident";
  self: string;
  html_url: string;
  number: number;
  status: "triggered" | "acknowledged" | "resolved";
  incident_key: string;
  title: string;
  service: { id: string; summary: string; html_url: string };
  assignees: Array<{ id: string; summary: string }>;
  escalation_policy: { id: string; summary: string };
  urgency: "high" | "low";
  priority?: { id: string; summary: string };
  created_at: string;
  resolved_at?: string;
}

/**
 * Verify a PagerDuty webhook signature. PagerDuty sends a header like
 * `x-pagerduty-signature: v1=<hmac_sha256>` (multiple `,`-separated when
 * keys rotate). We accept any matching signature.
 */
export async function verifyPagerDutyWebhook(
  request: Request,
  rawBody: string,
): Promise<boolean> {
  const secret = environment.PAGERDUTY_WEBHOOK_SECRET;
  if (!secret) {
    return environment.NODE_ENV !== "production";
  }
  const header = request.headers.get("x-pagerduty-signature");
  if (!header) return false;
  const provided = header
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1="))
    .map((s) => s.slice(3));
  if (provided.length === 0) return false;

  const expected = await hmacSha256Hex(secret, rawBody);
  return provided.some((sig) => timingSafeEqual(sig, expected));
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
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

export interface TriggerPagerDutyEvent {
  /** Maps to PagerDuty `routing_key` (Events API v2 integration key). */
  routingKey?: string;
  /** Stable dedup key — same key triggers the same incident. */
  dedupKey: string;
  summary: string;
  source: string;
  severity: "info" | "warning" | "error" | "critical";
  customDetails?: Record<string, unknown>;
}

/** Trigger an incident in PagerDuty via the Events API v2. */
export async function triggerPagerDuty(
  evt: TriggerPagerDutyEvent,
): Promise<{ status: string; dedup_key: string; message: string }> {
  const routingKey = evt.routingKey ?? environment.PAGERDUTY_ROUTING_KEY;
  if (!routingKey) throw new Error("PAGERDUTY_ROUTING_KEY is not set");
  const res = await fetch(EVENTS_V2, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      routing_key: routingKey,
      event_action: "trigger",
      dedup_key: evt.dedupKey,
      payload: {
        summary: evt.summary,
        source: evt.source,
        severity: evt.severity,
        custom_details: evt.customDetails,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`PagerDuty trigger failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { status: string; dedup_key: string; message: string };
}
