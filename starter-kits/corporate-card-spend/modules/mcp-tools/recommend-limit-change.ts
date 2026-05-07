import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Transaction } from "../repositories/transactions.ts";
import type { Card } from "../repositories/cards.ts";

interface Body {
  cardId: string;
}

interface TransactionPage {
  items: Transaction[];
  nextCursor: string | null;
}

/**
 * Orchestrator: recommend_limit_change.
 *
 * Looks at the last 90 days of posted spend on a card vs. its current limit
 * and recommends a new limit. Heuristic:
 *   - If 90d spend > 1.5x current limit → recommend +50%
 *   - If 90d spend < 0.3x current limit → recommend -25%
 *   - Otherwise no change.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";

  const card = await invokeJson<Card>(context, `/cards/${body.cardId}`, {
    headers: { authorization: auth },
  });

  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  let totalSpendCents = 0;
  let txCount = 0;
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<TransactionPage>(context, `/transactions?${qs}`, {
      headers: { authorization: auth },
    });
    for (const tx of page.items) {
      if (tx.cardId !== body.cardId) continue;
      if (tx.status !== "posted") continue;
      if (tx.postedAt < cutoff) continue;
      totalSpendCents += tx.amountCents;
      txCount += 1;
    }
    cursor = page.nextCursor;
    if (txCount > 5000) break;
  } while (cursor);

  const ratio = card.spendLimitCents > 0 ? totalSpendCents / card.spendLimitCents : 0;
  let recommendation: "increase" | "decrease" | "keep" = "keep";
  let recommendedLimitCents = card.spendLimitCents;
  if (ratio > 1.5) {
    recommendation = "increase";
    recommendedLimitCents = Math.round(card.spendLimitCents * 1.5);
  } else if (ratio < 0.3 && card.spendLimitCents > 10000) {
    recommendation = "decrease";
    recommendedLimitCents = Math.round(card.spendLimitCents * 0.75);
  }

  return new Response(
    JSON.stringify({
      cardId: body.cardId,
      currentLimitCents: card.spendLimitCents,
      ninetyDaySpendCents: totalSpendCents,
      transactionCount: txCount,
      utilizationRatio: ratio,
      recommendation,
      recommendedLimitCents,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
