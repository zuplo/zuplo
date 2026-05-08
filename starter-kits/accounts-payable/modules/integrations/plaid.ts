import { environment } from "@zuplo/runtime";

/**
 * Plaid Transactions integration.
 *
 * We use the Transactions Sync endpoint to pull a tenant's bank-account
 * transactions and reconcile against scheduled bill payments. Auth is the
 * standard Plaid pair: client_id + secret + per-user access_token.
 *
 * Docs: https://plaid.com/docs/api/products/transactions/
 */

const PLAID_API =
  environment.PLAID_ENV === "production"
    ? "https://production.plaid.com"
    : environment.PLAID_ENV === "development"
      ? "https://development.plaid.com"
      : "https://sandbox.plaid.com";

interface PlaidCreds {
  clientId: string;
  secret: string;
}

function requireCreds(): PlaidCreds {
  const clientId = environment.PLAID_CLIENT_ID;
  const secret = environment.PLAID_SECRET;
  if (!clientId) throw new Error("PLAID_CLIENT_ID is not set");
  if (!secret) throw new Error("PLAID_SECRET is not set");
  return { clientId, secret };
}

async function plaidPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const creds = requireCreds();
  const res = await fetch(`${PLAID_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: creds.clientId,
      secret: creds.secret,
      ...body,
    }),
  });
  if (!res.ok) {
    throw new Error(`Plaid ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code: string | null;
  date: string;
  authorized_date: string | null;
  name: string;
  merchant_name: string | null;
  pending: boolean;
  category: string[] | null;
  payment_meta?: { reference_number?: string | null };
}

export interface TransactionsSyncResponse {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: { transaction_id: string }[];
  next_cursor: string;
  has_more: boolean;
}

/**
 * Sync new transactions for an access token. Pass the cursor you stored from
 * the last sync; pass `undefined` to start from the beginning.
 */
export async function syncTransactions(args: {
  accessToken: string;
  cursor?: string;
  count?: number;
}): Promise<TransactionsSyncResponse> {
  return plaidPost<TransactionsSyncResponse>("/transactions/sync", {
    access_token: args.accessToken,
    cursor: args.cursor,
    count: args.count ?? 100,
  });
}

/**
 * Get a window of transactions for an access token. Use this when you don't
 * have a cursor stored — for ad-hoc reconciliation or backfills.
 */
export async function getTransactions(args: {
  accessToken: string;
  startDate: string;
  endDate: string;
  count?: number;
  offset?: number;
}): Promise<{ transactions: PlaidTransaction[]; total_transactions: number }> {
  return plaidPost<{ transactions: PlaidTransaction[]; total_transactions: number }>(
    "/transactions/get",
    {
      access_token: args.accessToken,
      start_date: args.startDate,
      end_date: args.endDate,
      options: {
        count: args.count ?? 100,
        offset: args.offset ?? 0,
      },
    },
  );
}
