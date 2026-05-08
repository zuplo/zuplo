import { environment } from "@zuplo/runtime";

/**
 * Stripe integration for donor management.
 *
 * Two modes:
 *  1. **One-off donations** — create a Checkout Session that the donor pays
 *     in their browser. The success webhook records the donation.
 *  2. **Recurring (sustaining) gifts** — create a Stripe Subscription with a
 *     monthly Price. The subscription webhook flips status, cancellations
 *     update the local recurring-gift row.
 *
 * For nonprofits, set the platform on a Stripe nonprofit pricing tier; the
 * REST surface is identical.
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
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: {
      authorization: `Bearer ${requireApiKey()}`,
      "stripe-version": "2024-06-20",
    },
  };
  if (body && method !== "GET") {
    (init.headers as Record<string, string>)["content-type"] =
      "application/x-www-form-urlencoded";
    init.body = formEncode(body);
  }
  const res = await fetch(`${STRIPE_API}${path}`, init);
  if (!res.ok) {
    throw new Error(`Stripe ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface CheckoutSession {
  id: string;
  url: string | null;
  payment_intent: string | null;
  customer: string | null;
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string>;
}

/**
 * Create a Checkout Session for a one-time donation. Donor lands on the
 * Stripe-hosted page, pays, and we get a `checkout.session.completed`
 * webhook. The metadata pins the local donor + campaign so the webhook can
 * write the donation row against the right tenant.
 */
export async function createDonationCheckoutSession(args: {
  amountCents: number;
  currency: string;
  donorEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata: { tenant_id: string; donor_id: string; campaign_id?: string };
}): Promise<CheckoutSession> {
  return stripeRequest<CheckoutSession>("POST", "/checkout/sessions", {
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: args.donorEmail,
    line_items: [
      {
        price_data: {
          currency: args.currency.toLowerCase(),
          product_data: { name: "Donation" },
          unit_amount: args.amountCents,
        },
        quantity: 1,
      },
    ],
    submit_type: "donate",
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    metadata: args.metadata,
  });
}

export interface RecurringGiftSession {
  id: string;
  url: string | null;
  customer: string | null;
  subscription: string | null;
  metadata: Record<string, string>;
}

/**
 * Create a Checkout Session for a recurring (monthly) sustaining gift.
 */
export async function createRecurringGiftCheckoutSession(args: {
  amountCents: number;
  currency: string;
  donorEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata: { tenant_id: string; donor_id: string; campaign_id?: string };
}): Promise<RecurringGiftSession> {
  return stripeRequest<RecurringGiftSession>("POST", "/checkout/sessions", {
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: args.donorEmail,
    line_items: [
      {
        price_data: {
          currency: args.currency.toLowerCase(),
          product_data: { name: "Sustaining Gift" },
          recurring: { interval: "month" },
          unit_amount: args.amountCents,
        },
        quantity: 1,
      },
    ],
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    metadata: args.metadata,
  });
}

export interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  payment_intent: string | null;
  receipt_url: string | null;
}

export async function getCharge(chargeId: string): Promise<StripeCharge> {
  return stripeRequest<StripeCharge>("GET", `/charges/${chargeId}`);
}

/**
 * Verify a Stripe webhook signature. Standard v1 scheme.
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
