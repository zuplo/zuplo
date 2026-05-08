import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Transaction } from "../repositories/transactions.ts";
import {
  postSlackMessage,
  lookupSlackUserByEmail,
  defaultFinanceChannel,
} from "../integrations/slack.ts";

interface Body {
  employeeEmail?: string;
  daysBack?: number;
  /** If true, DM each cardholder a memo-chase per uncoded transaction. */
  notifySlack?: boolean;
}

interface TransactionPage {
  items: Transaction[];
  nextCursor: string | null;
}

interface CardItem {
  id: string;
  employeeEmail: string;
}

interface CardPage {
  items: CardItem[];
  nextCursor: string | null;
}

/**
 * Orchestrator: find_uncoded_transactions.
 *
 * Lists posted transactions that haven't been GL-coded yet, optionally
 * filtered by employee. With `notifySlack=true`, the gateway looks up each
 * cardholder by email, opens a DM, and posts a friendly memo chase. The
 * cardholder responds inline; the agent (or your interactions webhook) calls
 * `add_memo` + `code_transaction` to close the loop.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const daysBack = Math.max(1, Math.min(365, body.daysBack ?? 30));
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString();
  const auth = request.headers.get("authorization") ?? "";

  // Resolve cards (we always need the card -> email mapping for slack DMs).
  const cards: CardItem[] = [];
  let cCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cCursor) qs.set("cursor", cCursor);
    const page = await invokeJson<CardPage>(context, `/cards?${qs}`, {
      headers: { authorization: auth },
    });
    cards.push(...page.items);
    cCursor = page.nextCursor;
  } while (cCursor);
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const cardIds = body.employeeEmail
    ? new Set(
        cards
          .filter((c) => c.employeeEmail.toLowerCase() === body.employeeEmail!.toLowerCase())
          .map((c) => c.id),
      )
    : null;

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

  const slackResults: { transactionId: string; ok: boolean; error?: string }[] = [];
  if (body.notifySlack && uncoded.length > 0) {
    // Group by employee so we send one DM per person, not per txn.
    const byEmail = new Map<string, Transaction[]>();
    for (const tx of uncoded) {
      const email = cardById.get(tx.cardId)?.employeeEmail;
      if (!email) continue;
      const arr = byEmail.get(email) ?? [];
      arr.push(tx);
      byEmail.set(email, arr);
    }

    for (const [email, txns] of byEmail) {
      try {
        const user = await lookupSlackUserByEmail(email);
        const channel = user ? user.id : defaultFinanceChannel();
        const lines = txns
          .slice(0, 20)
          .map(
            (tx) =>
              `• ${tx.merchantName} — $${(tx.amountCents / 100).toFixed(2)} on ${tx.postedAt.slice(0, 10)} (\`${tx.id}\`)`,
          )
          .join("\n");
        const more = txns.length > 20 ? `\n…and ${txns.length - 20} more` : "";
        await postSlackMessage({
          channel,
          text: `${txns.length} uncoded card transaction${txns.length === 1 ? "" : "s"} need a memo`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${txns.length} uncoded card transaction${txns.length === 1 ? "" : "s"} need a memo*\n\n${lines}${more}\n\nReply with the business purpose and I'll code them.`,
              },
            },
          ],
        });
        for (const tx of txns) slackResults.push({ transactionId: tx.id, ok: true });
      } catch (err) {
        for (const tx of txns)
          slackResults.push({
            transactionId: tx.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
      }
    }
  }

  return new Response(
    JSON.stringify({
      count: uncoded.length,
      transactions: uncoded,
      slackNotifications: body.notifySlack ? slackResults : undefined,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
