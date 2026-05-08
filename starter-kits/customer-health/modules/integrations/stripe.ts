/**
 * Stripe integration (read-only) — pull invoices and subscriptions for an
 * account so the customer-health kit can fold revenue health into churn
 * scoring.
 *
 * This kit never *writes* to Stripe — it just reads.
 *
 * Env:
 *   STRIPE_SECRET_KEY   sk_test_... or sk_live_... (RESTRICTED key with
 *                       read-only invoice + subscription scope is recommended)
 */

const STRIPE_API = "https://api.stripe.com/v1";

function authHeader(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return `Bearer ${key}`;
}

export interface StripeInvoiceSummary {
  id: string;
  status: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  due_date: number | null;
  paid: boolean;
  customer: string;
  created: number;
}

export interface StripeSubscriptionSummary {
  id: string;
  status: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  customer: string;
}

/** List recent invoices for a Stripe customer id. */
export async function listStripeInvoices(
  customerId: string,
  limit = 50,
): Promise<StripeInvoiceSummary[]> {
  const qs = new URLSearchParams({
    customer: customerId,
    limit: String(limit),
  });
  const res = await fetch(`${STRIPE_API}/invoices?${qs}`, {
    headers: { authorization: authHeader() },
  });
  if (!res.ok) {
    throw new Error(
      `Stripe invoices list failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { data: StripeInvoiceSummary[] };
  return json.data;
}

/** List active subscriptions for a Stripe customer id. */
export async function listStripeSubscriptions(
  customerId: string,
): Promise<StripeSubscriptionSummary[]> {
  const qs = new URLSearchParams({
    customer: customerId,
    status: "all",
    limit: "100",
  });
  const res = await fetch(`${STRIPE_API}/subscriptions?${qs}`, {
    headers: { authorization: authHeader() },
  });
  if (!res.ok) {
    throw new Error(
      `Stripe subscriptions list failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { data: StripeSubscriptionSummary[] };
  return json.data;
}

/**
 * Compute a simple revenue-health snapshot for a customer.
 * Useful for stuffing into the Claude prompt in predict_churn_risk.
 */
export interface RevenueHealth {
  customerId: string;
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  pastDueInvoices: number;
  outstandingAmountCents: number;
  hasActiveSubscription: boolean;
  hasCancellingSubscription: boolean;
  nextRenewalAt: string | null;
}

export async function getStripeRevenueHealth(
  customerId: string,
): Promise<RevenueHealth> {
  const [invoices, subs] = await Promise.all([
    listStripeInvoices(customerId, 100),
    listStripeSubscriptions(customerId),
  ]);

  const now = Math.floor(Date.now() / 1000);
  const paid = invoices.filter((i) => i.paid).length;
  const unpaid = invoices.filter((i) => !i.paid).length;
  const pastDue = invoices.filter(
    (i) => !i.paid && i.due_date !== null && i.due_date < now,
  );
  const outstanding = invoices
    .filter((i) => !i.paid)
    .reduce((s, i) => s + (i.amount_due - i.amount_paid), 0);

  const active = subs.filter((s) =>
    ["active", "trialing", "past_due"].includes(s.status),
  );
  const cancelling = active.filter((s) => s.cancel_at_period_end);
  const nextRenewal = active
    .map((s) => s.current_period_end)
    .filter((t) => typeof t === "number")
    .sort((a, b) => a - b)[0];

  return {
    customerId,
    totalInvoices: invoices.length,
    paidInvoices: paid,
    unpaidInvoices: unpaid,
    pastDueInvoices: pastDue.length,
    outstandingAmountCents: outstanding,
    hasActiveSubscription: active.length > 0,
    hasCancellingSubscription: cancelling.length > 0,
    nextRenewalAt:
      nextRenewal !== undefined
        ? new Date(nextRenewal * 1000).toISOString()
        : null,
  };
}
