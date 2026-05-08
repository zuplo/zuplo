/**
 * Stripe integration — invoice creation when a quote is accepted.
 *
 * Uses Stripe's REST API directly with form-encoded bodies (Stripe's
 * native format). When a quote is accepted, this kit creates a Customer
 * (or finds one), draws an Invoice with one line per quote line item,
 * and finalizes/sends it.
 *
 * Env:
 *   STRIPE_SECRET_KEY           sk_test_... or sk_live_...
 *   STRIPE_WEBHOOK_SIGNING_SECRET   whsec_... for /webhooks/stripe verification
 */

const STRIPE_API = "https://api.stripe.com/v1";

function authHeader(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return `Bearer ${key}`;
}

/** Form-encode a flat map. Stripe expects application/x-www-form-urlencoded. */
function form(body: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    params.set(k, String(v));
  }
  return params.toString();
}

export interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
}

export interface StripeInvoice {
  id: string;
  status: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  amount_due: number;
  currency: string;
  customer: string;
}

/** Find a customer by email, or create one. */
export async function getOrCreateStripeCustomer(
  email: string,
  name?: string,
): Promise<StripeCustomer> {
  const search = await fetch(
    `${STRIPE_API}/customers/search?query=${encodeURIComponent(`email:'${email}'`)}`,
    { headers: { authorization: authHeader() } },
  );
  if (search.ok) {
    const json = (await search.json()) as { data: StripeCustomer[] };
    if (json.data.length > 0) return json.data[0];
  }
  const create = await fetch(`${STRIPE_API}/customers`, {
    method: "POST",
    headers: {
      authorization: authHeader(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form({ email, name }),
  });
  if (!create.ok) {
    throw new Error(
      `Stripe customer create failed: ${create.status} ${await create.text()}`,
    );
  }
  return (await create.json()) as StripeCustomer;
}

/** Add a one-off invoice item to a customer's pending invoice. */
export async function addStripeInvoiceItem(
  customerId: string,
  amountCents: number,
  currency: string,
  description: string,
): Promise<{ id: string }> {
  const res = await fetch(`${STRIPE_API}/invoiceitems`, {
    method: "POST",
    headers: {
      authorization: authHeader(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form({
      customer: customerId,
      amount: amountCents,
      currency,
      description,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Stripe invoice item create failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as { id: string };
}

/** Create + finalize an invoice for the customer's pending items. */
export async function createAndFinalizeStripeInvoice(
  customerId: string,
  options: { autoAdvance?: boolean; daysUntilDue?: number } = {},
): Promise<StripeInvoice> {
  const create = await fetch(`${STRIPE_API}/invoices`, {
    method: "POST",
    headers: {
      authorization: authHeader(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form({
      customer: customerId,
      auto_advance: options.autoAdvance ?? true,
      collection_method: "send_invoice",
      days_until_due: options.daysUntilDue ?? 30,
    }),
  });
  if (!create.ok) {
    throw new Error(
      `Stripe invoice create failed: ${create.status} ${await create.text()}`,
    );
  }
  const draft = (await create.json()) as StripeInvoice;

  const finalize = await fetch(
    `${STRIPE_API}/invoices/${draft.id}/finalize`,
    {
      method: "POST",
      headers: { authorization: authHeader() },
    },
  );
  if (!finalize.ok) {
    throw new Error(
      `Stripe invoice finalize failed: ${finalize.status} ${await finalize.text()}`,
    );
  }
  return (await finalize.json()) as StripeInvoice;
}

/**
 * Verify a Stripe webhook signature.
 * https://stripe.com/docs/webhooks/signatures — `t=<ts>,v1=<sig>` format.
 */
export async function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string,
  toleranceSeconds = 300,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const secret = process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SIGNING_SECRET is not set");

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, ...rest] = p.split("=");
      return [k, rest.join("=")];
    }),
  );
  const ts = parts["t"];
  const v1 = parts["v1"];
  if (!ts || !v1) return { ok: false, reason: "malformed signature header" };

  const tsInt = parseInt(ts, 10);
  if (
    Number.isNaN(tsInt) ||
    Math.abs(Math.floor(Date.now() / 1000) - tsInt) > toleranceSeconds
  ) {
    return { ok: false, reason: "timestamp outside tolerance" };
  }

  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    enc.encode(`${ts}.${rawBody}`),
  );
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== v1.length) {
    return { ok: false, reason: "signature mismatch" };
  }
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return mismatch === 0
    ? { ok: true }
    : { ok: false, reason: "signature mismatch" };
}
