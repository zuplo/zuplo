import { environment } from "@zuplo/runtime";

/**
 * Stripe Checkout integration for reservation deposits.
 *
 * Used by the restaurant-reservations kit to optionally collect a
 * deposit when a guest books a high-demand night (NYE, Valentine's,
 * private rooms). We mint a Checkout Session, return the hosted URL
 * to the guest, and listen for `checkout.session.completed` /
 * `charge.refunded` on the inbound webhook.
 *
 * Docs:
 *   https://stripe.com/docs/api/checkout/sessions
 *   https://stripe.com/docs/webhooks/signatures
 */

const STRIPE_API = "https://api.stripe.com/v1";

function authHeaders(): Record<string, string> {
  const key = environment.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return {
    authorization: `Bearer ${key}`,
    "content-type": "application/x-www-form-urlencoded",
  };
}

function formEncode(
  payload: Record<string, string | number | boolean | undefined | null>,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  return params.toString();
}

export interface StripeCheckoutRequest {
  /** Total deposit amount in cents. */
  amountCents: number;
  currency: string;
  /** Description shown on the Checkout page. */
  description: string;
  /** Customer email — Stripe uses this for the receipt. */
  customerEmail: string;
  /** URL Stripe redirects to on successful payment. */
  successUrl: string;
  /** URL Stripe redirects to if the guest abandons. */
  cancelUrl: string;
  /** Free-form metadata. */
  metadata?: Record<string, string>;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
  payment_intent: string | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  status: "open" | "complete" | "expired";
  metadata: Record<string, string>;
}

/**
 * Create a Stripe Checkout Session for a reservation deposit.
 */
export async function createStripeCheckoutSession(
  req: StripeCheckoutRequest,
): Promise<StripeCheckoutSession> {
  const params: Record<string, string | number | boolean | undefined | null> = {
    mode: "payment",
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    customer_email: req.customerEmail,
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": req.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": req.amountCents,
    "line_items[0][price_data][product_data][name]": req.description,
  };
  for (const [k, v] of Object.entries(req.metadata ?? {})) {
    params[`metadata[${k}]`] = v;
    params[`payment_intent_data[metadata][${k}]`] = v;
  }

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: authHeaders(),
    body: formEncode(params),
  });
  if (!res.ok) {
    throw new Error(
      `Stripe Checkout Session creation failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as StripeCheckoutSession;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> & { id: string; metadata?: Record<string, string> } };
}

/**
 * Verify a Stripe webhook signature.
 */
export async function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  toleranceSeconds = 300,
): Promise<StripeWebhookEvent> {
  const secret = environment.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  if (!signatureHeader) throw new Error("Missing Stripe-Signature header");

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=", 2);
      return [k.trim(), v?.trim() ?? ""];
    }),
  );
  const ts = Number(parts.t);
  const v1 = parts.v1;
  if (!ts || !v1) throw new Error("Malformed Stripe-Signature header");
  if (Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) {
    throw new Error("Stripe webhook timestamp outside tolerance");
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${ts}.${rawBody}`),
  );
  const expected = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== v1.length) throw new Error("Stripe signature mismatch");
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  if (diff !== 0) throw new Error("Stripe signature mismatch");

  return JSON.parse(rawBody) as StripeWebhookEvent;
}
