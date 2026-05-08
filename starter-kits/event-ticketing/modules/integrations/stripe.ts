import { environment } from "@zuplo/runtime";

/**
 * Stripe REST integration.
 *
 * The kit talks to api.stripe.com directly with form-encoded bodies (no
 * SDK — Zuplo's edge runtime is fetch-only). Used to mint a
 * PaymentIntent when an order is placed and to verify Stripe webhook
 * signatures so the gateway can flip an order to "paid" on
 * `payment_intent.succeeded`.
 *
 * Docs: https://stripe.com/docs/api
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

export interface StripePaymentIntentRequest {
  amountCents: number;
  currency: string;
  /** Customer-facing description that lands on the receipt. */
  description?: string;
  /** Email used to send the Stripe receipt (and we reuse for our own). */
  receiptEmail?: string;
  /** Free-form metadata. Stripe limits to 50 keys, 500-char values. */
  metadata?: Record<string, string>;
  /** When true (default), allow Stripe to use any saved payment method on the customer. */
  automaticPaymentMethods?: boolean;
}

export interface StripePaymentIntent {
  id: string;
  client_secret: string;
  status: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
}

/**
 * Create a Stripe PaymentIntent. Returns the client_secret for the
 * frontend to confirm with Stripe.js.
 */
export async function createStripePaymentIntent(
  req: StripePaymentIntentRequest,
): Promise<StripePaymentIntent> {
  const params: Record<string, string | number | boolean | undefined | null> = {
    amount: req.amountCents,
    currency: req.currency.toLowerCase(),
    description: req.description,
    receipt_email: req.receiptEmail,
    "automatic_payment_methods[enabled]": req.automaticPaymentMethods ?? true,
  };
  for (const [k, v] of Object.entries(req.metadata ?? {})) {
    params[`metadata[${k}]`] = v;
  }

  const res = await fetch(`${STRIPE_API}/payment_intents`, {
    method: "POST",
    headers: authHeaders(),
    body: formEncode(params),
  });
  if (!res.ok) {
    throw new Error(
      `Stripe PaymentIntent creation failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as StripePaymentIntent;
}

/**
 * Retrieve a PaymentIntent (used by webhook handlers to refresh
 * server-side truth when needed).
 */
export async function getStripePaymentIntent(
  id: string,
): Promise<StripePaymentIntent> {
  const res = await fetch(`${STRIPE_API}/payment_intents/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${environment.STRIPE_SECRET_KEY ?? ""}` },
  });
  if (!res.ok) {
    throw new Error(
      `Stripe PaymentIntent fetch failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as StripePaymentIntent;
}

/**
 * Refund a PaymentIntent. Pass `amountCents` for partial refunds.
 */
export async function createStripeRefund(req: {
  paymentIntent: string;
  amountCents?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
}): Promise<{ id: string; status: string; amount: number }> {
  const res = await fetch(`${STRIPE_API}/refunds`, {
    method: "POST",
    headers: authHeaders(),
    body: formEncode({
      payment_intent: req.paymentIntent,
      amount: req.amountCents,
      reason: req.reason,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Stripe refund failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as { id: string; status: string; amount: number };
}

/**
 * Verify a Stripe webhook signature.
 *
 * Stripe signs every webhook with `whsec_…` (set in dashboard > Developers >
 * Webhooks). The header looks like `t=<unix>,v1=<hex>`. We HMAC
 * `<unix>.<rawBody>` with SHA-256 and compare in constant time.
 *
 * Returns the parsed event on success or throws on signature mismatch.
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

  // Constant-time compare.
  if (expected.length !== v1.length) throw new Error("Stripe signature mismatch");
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  if (diff !== 0) throw new Error("Stripe signature mismatch");

  return JSON.parse(rawBody) as StripeWebhookEvent;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  created: number;
  data: {
    object: {
      id: string;
      amount?: number;
      currency?: string;
      status?: string;
      metadata?: Record<string, string>;
      receipt_email?: string;
      [k: string]: unknown;
    };
  };
}
