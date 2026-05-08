import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { listRampTransactions } from "../integrations/ramp.ts";
import {
  transactionRepository,
  type Transaction,
} from "../repositories/transactions.ts";
import { cardRepository } from "../repositories/cards.ts";

/**
 * Orchestrator MCP tool: sync_ramp_transactions.
 *
 * Pulls a window of Ramp transactions and upserts them into the local
 * transaction store. The local store is the canonical record once synced
 * (so coding/memos stay against the same row even if Ramp reissues IDs).
 *
 * Cards are matched by Ramp `card_id` -> local card id; if a card hasn't
 * been provisioned locally we skip the txn and surface it under
 * `unknownCards` so the agent can call `create_card` first.
 */

interface Body {
  fromDate?: string;
  toDate?: string;
  state?: "CLEARED" | "PENDING" | "DECLINED";
}

export default async function (request: ZuploRequest, _context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json().catch(() => ({}))) as Body;

  // Build a card index by external id (last4 fallback) so we can map Ramp
  // card_id to a local card row. This kit stores Ramp ids in the card
  // entity's `last4` field by default — adapt if you carry a separate column.
  const cards = [];
  let cCursor: string | null | undefined = undefined;
  do {
    const page = await cardRepository.list(tenantId, {
      limit: 200,
      cursor: cCursor ?? undefined,
    });
    cards.push(...page.items);
    cCursor = page.nextCursor;
  } while (cCursor);
  const cardByLast4 = new Map(cards.map((c) => [c.last4, c]));

  let imported = 0;
  let updated = 0;
  const unknownCards = new Set<string>();
  let nextPage: string | undefined;

  do {
    const page = await listRampTransactions({
      from: body.fromDate,
      to: body.toDate,
      state: body.state,
      limit: 100,
      nextPage,
    });

    for (const rt of page.data) {
      const localCard = rt.card_id
        ? Array.from(cardByLast4.values()).find(
            (c) => c.last4 === rt.card_id || c.last4.endsWith(rt.card_id?.slice(-4) ?? ""),
          )
        : undefined;
      if (!localCard) {
        if (rt.card_id) unknownCards.add(rt.card_id);
        continue;
      }

      const existing = await transactionRepository.get(tenantId, rt.id).catch(() => null);
      const data: Omit<Transaction, "id" | "tenantId"> = {
        cardId: localCard.id,
        amountCents: Math.round(rt.amount * 100),
        currency: rt.currency_code,
        merchantName: rt.merchant_name ?? "",
        mcc: rt.merchant_category_code != null ? String(rt.merchant_category_code) : "",
        postedAt: rt.user_transaction_time,
        category: rt.sk_category_name,
        glCode: null,
        memo: rt.memo,
        status:
          rt.state === "CLEARED"
            ? "posted"
            : rt.state === "PENDING"
              ? "pending"
              : rt.state === "DECLINED"
                ? "declined"
                : "posted",
        coded: rt.sk_category_id != null,
      };

      if (existing) {
        await transactionRepository.update(tenantId, rt.id, data);
        updated++;
      } else {
        // Use the Ramp id directly so subsequent syncs find the same row.
        await transactionRepository.create(tenantId, { ...data, id: rt.id } as never);
        imported++;
      }
    }

    nextPage = page.page.next ?? undefined;
  } while (nextPage);

  return new Response(
    JSON.stringify({
      imported,
      updated,
      unknownCardCount: unknownCards.size,
      unknownCards: Array.from(unknownCards),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
