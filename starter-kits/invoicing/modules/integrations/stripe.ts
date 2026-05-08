import { environment } from "@zuplo/runtime";

/**
 * Stripe REST integration.
 *
 * We hit api.stripe.com directly (no Node SDK — Zuplo's edge runtime is
 * fetch-only). Auth is the standard `Authorization: Bearer sk_xxx`.
 *
 * Used by:
 *  - chase_overdue_invoices (creates a Stripe hosted invoice for collection)
 *  - record_payment (verifies a charge id with Stripe before flipping status)
 *  - /webhooks/stripe (verifies inbound `invoice.payment_succeeded` events)
 */

const STRIPE_API = "https://api.stripe.com/v1";

function requireApiKey(): string {
  const key = environment.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return key;
}

/**
 * Form-encode a flat or nested object the way Stripe expects
 * (e.g. `metadata[invoice_id]=inv_123`).
 */
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
        if (typeof v === "object") {
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

export interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
  metadata: Record<string, string>;
}

export interface StripeInvoice {
  id: string;
  customer: string;
  status: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  metadata: Record<string, string>;
}

export interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  paid: boolean;
  status: string;
  metadata: Record<string, string>;
}

/** Look up or create a Stripe customer keyed by your tenant's customer id. */
export async function upsertStripeCustomer(args: {
  email: string;
  name: string;
  tenantCustomerId: string;
}): Promise<StripeCustomer> {
  const search = await stripeRequest<{ data: StripeCustomer[] }>(
    "GET",
    `/customers/search?query=${encodeURIComponent(`metadata['tenant_customer_id']:'${args.tenantCustomerId}'`)}`,
  );
  if (search.data.length > 0) return search.data[0];

  return stripeRequest<StripeCustomer>("POST", "/customers", {
    email: args.email,
    name: args.name,
    metadata: { tenant_customer_id: args.tenantCustomerId },
  });
}

/**
 * Create + finalize a Stripe invoice for an existing customer. Returns the
 * hosted invoice URL the customer can pay on.
 */
export async function createAndSendStripeInvoice(args: {
  stripeCustomerId: string;
  amountCents: number;
  currency: string;
  description: string;
  daysUntilDue: number;
  metadata?: Record<string, string>;
}): Promise<StripeInvoice> {
  // 1. Add a one-off invoice item
  await stripeRequest<unknown>("POST", "/invoiceitems", {
    customer: args.stripeCustomerId,
    amount: args.amountCents,
    currency: args.currency.toLowerCase(),
    description: args.description,
  });

  // 2. Create the invoice (pulls in pending invoice items)
  const invoice = await stripeRequest<StripeInvoice>("POST", "/invoices", {
    customer: args.stripeCustomerId,
    collection_method: "send_invoice",
    days_until_due: args.daysUntilDue,
    metadata: args.metadata,
  });

  // 3. Finalize and send
  await stripeRequest<unknown>("POST", `/invoices/${invoice.id}/finalize`, {});
  return stripeRequest<StripeInvoice>("POST", `/invoices/${invoice.id}/send`, {});
}

/** Retrieve a charge to verify it landed (used by record_payment as a sanity check). */
export async function retrieveCharge(chargeId: string): Promise<StripeCharge> {
  return stripeRequest<StripeCharge>("GET", `/charges/${chargeId}`);
}

/**
 * Verify a Stripe webhook signature.
 *
 * Stripe uses a `Stripe-Signature: t=<timestamp>,v1=<hex hmac>` header. The
 * signed payload is `${timestamp}.${rawBody}` HMAC-SHA256'd with the webhook
 * secret. This is the documented v1 scheme — see
 * https://docs.stripe.com/webhooks#verify-manually.
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

  // constant-time compare
  if (hex.length !== v1.length) return false;
  let mismatch = 0;
  for (let i = 0; i < hex.length; i++) mismatch |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return mismatch === 0;
}
