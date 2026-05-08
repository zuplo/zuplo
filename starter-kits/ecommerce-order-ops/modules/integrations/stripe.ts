import { environment } from "@zuplo/runtime";

/**
 * Stripe REST integration for the e-commerce kit.
 *
 * Used to verify inbound webhook signatures so the gateway can flip an
 * order to `paid` on `payment_intent.succeeded` and to `refunded` on
 * `charge.refunded`. We do not mint PaymentIntents here — the kit is a
 * fulfillment OMS, and the storefront is responsible for the checkout
 * flow. We just listen for the result.
 *
 * Docs: https://stripe.com/docs/webhooks/signatures
 */

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

/**
 * Verify a Stripe webhook signature and return the parsed event.
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
