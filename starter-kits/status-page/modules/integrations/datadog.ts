import { environment } from "@zuplo/runtime";

/**
 * Datadog webhook helpers — verifies inbound monitor events that should
 * open / update incidents on the status page.
 *
 * Datadog signs webhooks with HMAC SHA-256 in `x-datadog-signature` (you
 * configure the secret on the Datadog side when creating the webhook).
 *
 * Docs: https://docs.datadoghq.com/integrations/webhooks/
 */

export async function verifyDatadogWebhook(
  request: Request,
  rawBody: string,
): Promise<boolean> {
  const secret = environment.DATADOG_WEBHOOK_SECRET;
  if (!secret) return environment.NODE_ENV !== "production";
  const provided = request.headers.get("x-datadog-signature");
  if (!provided) return false;

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(provided.trim(), expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/** Subset of Datadog Monitor webhook payload fields we care about. */
export interface DatadogAlert {
  alertId?: string;
  alertType?: "error" | "warning" | "info" | "success" | "recovery";
  alertStatus?: "Triggered" | "Recovered" | "Re-Triggered";
  title?: string;
  body?: string;
  monitorName?: string;
  /** Datadog tags from the firing series. We use `component:<slug>` and
   * `severity:<minor|major|critical>` to map to status-page entities. */
  tags?: string[];
  eventTime?: number;
}

/** Pull the first tag matching `prefix:` and return the tail value. */
export function tagValue(alert: DatadogAlert, prefix: string): string | null {
  for (const t of alert.tags ?? []) {
    if (t.startsWith(`${prefix}:`)) return t.slice(prefix.length + 1);
  }
  return null;
}

/** Pull every tag matching `prefix:` and return the values as an array. */
export function tagValues(alert: DatadogAlert, prefix: string): string[] {
  const out: string[] = [];
  for (const t of alert.tags ?? []) {
    if (t.startsWith(`${prefix}:`)) out.push(t.slice(prefix.length + 1));
  }
  return out;
}
