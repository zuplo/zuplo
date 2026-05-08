import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import { getTransactions } from "../integrations/plaid.ts";
import type { Bill, BillPayment } from "../repositories/bills.ts";

/**
 * Orchestrator MCP tool: reconcile_with_bank.
 *
 * Pulls a window of bank transactions via Plaid and matches each one against
 * scheduled BillPayments by amount + date proximity. Returns the proposed
 * matches so the LLM (or a human) can confirm — flipping the bill to `paid`
 * happens via the standard handler (or the Stripe webhook path).
 *
 * Plaid access tokens are per-bank-connection. This kit reads
 * PLAID_ACCESS_TOKEN as a single tenant token; multi-tenant deployments
 * should store the token on a `BankConnection` entity keyed by tenantId.
 */

interface Body {
  startDate?: string;
  endDate?: string;
  amountToleranceCents?: number;
  dayWindow?: number;
}

interface BillPaymentPage {
  items: BillPayment[];
  nextCursor: string | null;
}
interface BillPage {
  items: Bill[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };
  const accessToken = environment.PLAID_ACCESS_TOKEN;
  if (!accessToken) {
    return new Response(
      JSON.stringify({
        error: {
          type: "plaid_not_configured",
          message: "PLAID_ACCESS_TOKEN is not set. Link a bank account first.",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const today = new Date();
  const startDate =
    body.startDate ??
    new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = body.endDate ?? today.toISOString().slice(0, 10);
  const amountTolerance = Math.max(0, body.amountToleranceCents ?? 0);
  const dayWindow = Math.max(0, body.dayWindow ?? 3);

  const txns = await getTransactions({
    accessToken,
    startDate,
    endDate,
    count: 250,
  });

  // Pull scheduled (unpaid) payments + bill metadata.
  const payments: BillPayment[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<BillPaymentPage>(context, `/bill-payments?${qs}`, {
      headers: auth,
    });
    payments.push(...page.items);
    cursor = page.nextCursor;
    if (payments.length > 5000) break;
  } while (cursor);

  const bills: Bill[] = [];
  let bCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (bCursor) qs.set("cursor", bCursor);
    const page = await invokeJson<BillPage>(context, `/bills?${qs}`, { headers: auth });
    bills.push(...page.items);
    bCursor = page.nextCursor;
    if (bills.length > 5000) break;
  } while (bCursor);
  const billById = new Map(bills.map((b) => [b.id, b]));

  const unpaid = payments.filter((p) => !p.paidAt);
  const matches = [];
  const unmatchedTxns = [];

  for (const t of txns.transactions) {
    if (t.pending) continue;
    // Plaid amounts are positive for outflows on liability accounts; we treat
    // any non-pending txn whose absolute value matches a payment as a candidate.
    const txnAmountCents = Math.round(Math.abs(t.amount) * 100);
    const candidates = unpaid
      .map((p) => {
        const amountDelta = Math.abs(p.amountCents - txnAmountCents);
        const dayDelta = Math.abs(
          (new Date(t.date).getTime() - new Date(p.scheduledFor).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        return { p, amountDelta, dayDelta };
      })
      .filter((c) => c.amountDelta <= amountTolerance && c.dayDelta <= dayWindow)
      .sort((a, b) => a.amountDelta - b.amountDelta || a.dayDelta - b.dayDelta);

    if (candidates.length === 0) {
      unmatchedTxns.push(t);
      continue;
    }

    matches.push({
      transaction: {
        id: t.transaction_id,
        date: t.date,
        amount: t.amount,
        currency: t.iso_currency_code,
        merchant: t.merchant_name ?? t.name,
      },
      payment: candidates[0].p,
      bill: billById.get(candidates[0].p.billId) ?? null,
      amountDeltaCents: candidates[0].amountDelta,
      dayDelta: candidates[0].dayDelta,
      otherCandidates: candidates.slice(1, 3).map((c) => ({
        paymentId: c.p.id,
        amountDeltaCents: c.amountDelta,
        dayDelta: c.dayDelta,
      })),
    });
  }

  return new Response(
    JSON.stringify({
      window: { startDate, endDate },
      txnCount: txns.transactions.length,
      matchCount: matches.length,
      unmatchedTxnCount: unmatchedTxns.length,
      matches,
      unmatchedTxns: unmatchedTxns.slice(0, 50).map((t) => ({
        id: t.transaction_id,
        date: t.date,
        amount: t.amount,
        merchant: t.merchant_name ?? t.name,
      })),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
