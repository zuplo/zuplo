import { environment } from "@zuplo/runtime";

/**
 * Stripe integration for AP — used to push outbound payments via Stripe
 * Connect Transfers (or to verify webhook events from a connected billing
 * setup).
 *
 * For pure ACH bill-pay, Plaid + your bank's API is the usual rail; this
 * file handles the case where you want to pay vendors via card on file or
 * Stripe-issued virtual cards.
 *
 * Docs: https://docs.stripe.com/api/transfers
 */

const STRIPE_API = "https://api.stripe.com/v1";

function requireApiKey(): string {
  const key = environment.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return key;
}

function formEncode(
  obj: Record<string, unknown>,
  prefix?: string,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object" && !Array.isArray(value)) {
      parts.push(formEncode(value as Record<string, unknown>, fullKey));
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === "object" && v !== null) {
          parts.push(formEncode(v as Record<string, unknown>, `${fullKey}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(String(v))}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

async function stripeRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  options?: { idempotencyKey?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${requireApiKey()}`,
    "stripe-version": "2024-06-20",
  };
  if (options?.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
  const init: RequestInit = { method, headers };
  if (body && method !== "GET") {
    headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = formEncode(body);
  }
  const res = await fetch(`${STRIPE_API}${path}`, init);
  if (!res.ok) {
    throw new Error(`Stripe ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface StripeTransfer {
  id: string;
  amount: number;
  currency: string;
  destination: string;
  metadata: Record<string, string>;
}

/**
 * Send a payout to a connected vendor account. The `connectedAccountId` is
 * the vendor's Stripe Express/Custom account id (acct_xxx) — typically
 * stored on the Vendor entity in `metadata.stripe_account_id`.
 */
export async function transferToVendor(args: {
  amountCents: number;
  currency: string;
  connectedAccountId: string;
  metadata?: Record<string, string>;
  idempotencyKey: string;
}): Promise<StripeTransfer> {
  return stripeRequest<StripeTransfer>(
    "POST",
    "/transfers",
    {
      amount: args.amountCents,
      currency: args.currency.toLowerCase(),
      destination: args.connectedAccountId,
      metadata: args.metadata,
    },
    { idempotencyKey: args.idempotencyKey },
  );
}

/**
 * Verify a Stripe webhook signature (same v1 scheme as the other kits).
 */
export async function verifyStripeSignature(args: {
  rawBody: string;
  signatureHeader: string;
  toleranceSeconds?: number;
}): Promise<boolean> {
  const secret = environment.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

  const parts = Object.fromEntries(
    args.signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k.trim(), v?.trim() ?? ""];
    }),
  );
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return false;

  const tolerance = args.toleranceSeconds ?? 300;
  const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10));
  if (Number.isNaN(age) || age > tolerance) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${timestamp}.${args.rawBody}`),
  );
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (hex.length !== v1.length) return false;
  let mismatch = 0;
  for (let i = 0; i < hex.length; i++) mismatch |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return mismatch === 0;
}
