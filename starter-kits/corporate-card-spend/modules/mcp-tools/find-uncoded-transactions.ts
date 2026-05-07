import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Transaction } from "../repositories/transactions.ts";

interface Body {
  employeeEmail?: string;
  daysBack?: number;
}

interface TransactionPage {
  items: Transaction[];
  nextCursor: string | null;
}

interface CardPage {
  items: Array<{ id: string; employeeEmail: string }>;
  nextCursor: string | null;
}

/**
 * Orchestrator: find_uncoded_transactions.
 *
 * Lists posted transactions that haven't been GL-coded yet, optionally
 * filtered by employee. Useful for nudging employees to expense-code their
 * card spend before month-end close.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const daysBack = Math.max(1, Math.min(365, body.daysBack ?? 30));
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString();
  const auth = request.headers.get("authorization") ?? "";

  // Optional: resolve employee → card ids first
  let cardIds: Set<string> | null = null;
  if (body.employeeEmail) {
    cardIds = new Set();
    let cursor: string | null | undefined;
    do {
      const qs = new URLSearchParams({ limit: "200" });
      if (cursor) qs.set("cursor", cursor);
      const page = await invokeJson<CardPage>(context, `/cards?${qs}`, {
        headers: { authorization: auth },
      });
      for (const c of page.items) {
        if (c.employeeEmail.toLowerCase() === body.employeeEmail.toLowerCase()) {
          cardIds.add(c.id);
        }
      }
      cursor = page.nextCursor;
    } while (cursor);
  }

  const uncoded: Transaction[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<TransactionPage>(context, `/transactions?${qs}`, {
      headers: { authorization: auth },
    });
    for (const tx of page.items) {
      if (tx.status !== "posted") continue;
      if (tx.coded) continue;
      if (tx.postedAt < cutoff) continue;
      if (cardIds && !cardIds.has(tx.cardId)) continue;
      uncoded.push(tx);
    }
    cursor = page.nextCursor;
    if (uncoded.length > 1000) break;
  } while (cursor);

  return new Response(
    JSON.stringify({ count: uncoded.length, transactions: uncoded }),
    { headers: { "content-type": "application/json" } },
  );
}
