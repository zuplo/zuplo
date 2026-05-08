import { environment } from "@zuplo/runtime";

/**
 * Stripe Billing integration.
 *
 * This kit is a *thin* wrapper over Stripe Billing — Stripe owns subscription
 * state, invoices, and renewals. We only persist the mapping
 * (`stripeSubscriptionId`, `stripePriceId`, `stripeCustomerId`) and read
 * status back through the API or via webhooks. Don't duplicate Stripe's
 * subscription model in your DB.
 *
 * REST docs: https://docs.stripe.com/api
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

export interface StripeSubscription {
  id: string;
  customer: string;
  status:
    | "active"
    | "past_due"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "unpaid"
    | "paused";
  current_period_start: number;
  current_period_end: number;
  trial_end: number | null;
  canceled_at: number | null;
  cancel_at_period_end: boolean;
  pause_collection: { behavior: string; resumes_at: number | null } | null;
  items: { data: { id: string; price: { id: string; product: string } }[] };
  metadata: Record<string, string>;
}

export interface StripeProduct {
  id: string;
  name: string;
  metadata: Record<string, string>;
}

export interface StripePrice {
  id: string;
  product: string;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: "month" | "year"; interval_count: number } | null;
  metadata: Record<string, string>;
}

/** Idempotently look up or create a Stripe customer keyed by tenant customer id. */
export async function upsertStripeCustomer(args: {
  email: string;
  name: string;
  tenantCustomerId: string;
}): Promise<{ id: string; email: string | null }> {
  const search = await stripeRequest<{ data: { id: string; email: string | null }[] }>(
    "GET",
    `/customers/search?query=${encodeURIComponent(`metadata['tenant_customer_id']:'${args.tenantCustomerId}'`)}`,
  );
  if (search.data.length > 0) return search.data[0];

  return stripeRequest<{ id: string; email: string | null }>("POST", "/customers", {
    email: args.email,
    name: args.name,
    metadata: { tenant_customer_id: args.tenantCustomerId },
  });
}

/** Create a Product+Price pair backed by a Plan in this kit. */
export async function createStripePlan(args: {
  name: string;
  intervalUnit: "month" | "year";
  priceCents: number;
  currency: string;
  tenantPlanId: string;
}): Promise<{ productId: string; priceId: string }> {
  const product = await stripeRequest<StripeProduct>("POST", "/products", {
    name: args.name,
    metadata: { tenant_plan_id: args.tenantPlanId },
  });
  const price = await stripeRequest<StripePrice>("POST", "/prices", {
    unit_amount: args.priceCents,
    currency: args.currency.toLowerCase(),
    recurring: { interval: args.intervalUnit },
    product: product.id,
    metadata: { tenant_plan_id: args.tenantPlanId },
  });
  return { productId: product.id, priceId: price.id };
}

/** Create a Stripe subscription. Returns the canonical Stripe object. */
export async function createStripeSubscription(args: {
  stripeCustomerId: string;
  stripePriceId: string;
  trialEnd?: number; // unix seconds
  metadata?: Record<string, string>;
}): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>("POST", "/subscriptions", {
    customer: args.stripeCustomerId,
    items: [{ price: args.stripePriceId }],
    trial_end: args.trialEnd,
    metadata: args.metadata,
  });
}

export async function getStripeSubscription(id: string): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>("GET", `/subscriptions/${id}`);
}

/**
 * Cancel a Stripe subscription. By default cancels at period end (the customer
 * keeps access for what they've already paid). Set immediate=true to cancel
 * now and prorate.
 */
export async function cancelStripeSubscription(args: {
  stripeSubscriptionId: string;
  immediate?: boolean;
}): Promise<StripeSubscription> {
  if (args.immediate) {
    return stripeRequest<StripeSubscription>("DELETE", `/subscriptions/${args.stripeSubscriptionId}`);
  }
  return stripeRequest<StripeSubscription>(
    "POST",
    `/subscriptions/${args.stripeSubscriptionId}`,
    { cancel_at_period_end: true },
  );
}

/** Pause collection on a subscription. Stripe keeps it active but stops billing. */
export async function pauseStripeSubscription(
  stripeSubscriptionId: string,
): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(
    "POST",
    `/subscriptions/${stripeSubscriptionId}`,
    { pause_collection: { behavior: "void" } },
  );
}

/** Resume collection on a subscription. */
export async function resumeStripeSubscription(
  stripeSubscriptionId: string,
): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(
    "POST",
    `/subscriptions/${stripeSubscriptionId}`,
    { pause_collection: "" },
  );
}

/**
 * Report metered usage against a subscription item. Stripe rolls these up at
 * period end and charges the overage rate.
 */
export async function recordStripeUsage(args: {
  subscriptionItemId: string;
  quantity: number;
  timestamp?: number;
  action?: "increment" | "set";
}): Promise<{ id: string; quantity: number; timestamp: number }> {
  return stripeRequest<{ id: string; quantity: number; timestamp: number }>(
    "POST",
    `/subscription_items/${args.subscriptionItemId}/usage_records`,
    {
      quantity: args.quantity,
      timestamp: args.timestamp ?? Math.floor(Date.now() / 1000),
      action: args.action ?? "increment",
    },
  );
}

/** List recent invoices for a customer. */
export async function listStripeInvoicesForCustomer(
  stripeCustomerId: string,
  limit = 50,
): Promise<{
  data: { id: string; status: string; total: number; currency: string; created: number }[];
}> {
  return stripeRequest<{
    data: { id: string; status: string; total: number; currency: string; created: number }[];
  }>("GET", `/invoices?customer=${stripeCustomerId}&limit=${limit}`);
}

/**
 * Verify a Stripe webhook signature. See modules/integrations/stripe.ts in
 * other kits — same v1 scheme.
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

/** Map a Stripe subscription status to this kit's local status enum. */
export function mapStripeStatus(
  s: StripeSubscription["status"],
  pauseCollection: StripeSubscription["pause_collection"],
): "active" | "past_due" | "canceled" | "paused" {
  if (pauseCollection) return "paused";
  if (s === "canceled" || s === "incomplete_expired") return "canceled";
  if (s === "past_due" || s === "unpaid") return "past_due";
  if (s === "paused") return "paused";
  return "active";
}
