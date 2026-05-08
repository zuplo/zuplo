import { environment } from "@zuplo/runtime";

/**
 * Ramp Developer API integration.
 *
 * Ramp uses OAuth2 client credentials. We exchange (client_id, client_secret)
 * for an access token, cache it in memory until expiry-ish, and call the v1
 * REST surface.
 *
 * Docs: https://docs.ramp.com/developer-api/v1/
 */

const RAMP_API = "https://api.ramp.com/developer/v1";
const RAMP_OAUTH = "https://api.ramp.com/developer/v1/token";

interface CachedToken {
  token: string;
  expiresAt: number;
}
let cached: CachedToken | null = null;

async function getRampToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 5_000) return cached.token;

  const clientId = environment.RAMP_CLIENT_ID;
  const clientSecret = environment.RAMP_CLIENT_SECRET;
  if (!clientId) throw new Error("RAMP_CLIENT_ID is not set");
  if (!clientSecret) throw new Error("RAMP_CLIENT_SECRET is not set");

  const auth = btoa(`${clientId}:${clientSecret}`);
  const scope =
    environment.RAMP_OAUTH_SCOPE ??
    "transactions:read cards:read cards:write users:read";
  const res = await fetch(RAMP_OAUTH, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Ramp token failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

async function rampRequest<T>(
  method: "GET" | "POST" | "PATCH" | "PUT",
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getRampToken();
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: "application/json",
  };
  const init: RequestInit = { method, headers };
  if (body && method !== "GET") {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${RAMP_API}${path}`, init);
  if (!res.ok) {
    throw new Error(`Ramp ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface RampTransaction {
  id: string;
  amount: number;
  currency_code: string;
  user_transaction_time: string;
  merchant_name: string | null;
  merchant_category_code: number | null;
  state: string; // CLEARED, PENDING, DECLINED, ...
  card_id: string | null;
  user_id: string | null;
  sk_category_id: number | null;
  sk_category_name: string | null;
  memo: string | null;
  policy_violations: { type: string; description: string }[];
  receipts: { id: string }[];
}

export interface RampPage<T> {
  data: T[];
  page: { next: string | null };
}

/**
 * List Ramp transactions. Pass `from`/`to` as ISO timestamps to bound the
 * window; `nextPage` continues from a previous response's `page.next`.
 */
export async function listRampTransactions(args: {
  from?: string;
  to?: string;
  limit?: number;
  nextPage?: string;
  state?: "CLEARED" | "PENDING" | "DECLINED";
}): Promise<RampPage<RampTransaction>> {
  const qs = new URLSearchParams();
  if (args.from) qs.set("from_date", args.from);
  if (args.to) qs.set("to_date", args.to);
  if (args.limit) qs.set("page_size", String(args.limit));
  if (args.nextPage) qs.set("start", args.nextPage);
  if (args.state) qs.set("state", args.state);
  return rampRequest<RampPage<RampTransaction>>(
    "GET",
    `/transactions?${qs.toString()}`,
  );
}

export interface RampCard {
  id: string;
  cardholder_id: string;
  display_name: string;
  state: string;
  spending_restrictions: {
    amount: number;
    interval: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "TOTAL";
    categories: number[] | null;
  };
}

/** List corporate cards. */
export async function listRampCards(args: {
  limit?: number;
  nextPage?: string;
}): Promise<RampPage<RampCard>> {
  const qs = new URLSearchParams();
  if (args.limit) qs.set("page_size", String(args.limit));
  if (args.nextPage) qs.set("start", args.nextPage);
  return rampRequest<RampPage<RampCard>>("GET", `/cards?${qs.toString()}`);
}

/** Update a card's spending limit. */
export async function updateRampCardLimit(args: {
  cardId: string;
  amountCents: number;
  interval: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "TOTAL";
}): Promise<RampCard> {
  return rampRequest<RampCard>("PATCH", `/cards/${args.cardId}`, {
    spending_restrictions: {
      amount: args.amountCents,
      interval: args.interval,
    },
  });
}

/** Freeze a card (block new charges). */
export async function freezeRampCard(cardId: string): Promise<RampCard> {
  return rampRequest<RampCard>("POST", `/cards/${cardId}/suspension`, {});
}

/** Unfreeze a card. */
export async function unfreezeRampCard(cardId: string): Promise<RampCard> {
  return rampRequest<RampCard>("DELETE" as "POST", `/cards/${cardId}/suspension`);
}

/** Add or update a memo on a transaction. */
export async function setRampTransactionMemo(args: {
  transactionId: string;
  memo: string;
}): Promise<RampTransaction> {
  return rampRequest<RampTransaction>(
    "PATCH",
    `/transactions/${args.transactionId}`,
    { memo: args.memo },
  );
}
