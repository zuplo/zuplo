import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Order } from "../repositories/orders.ts";

interface Body {
  fraudScoreThreshold?: number;
}

interface OrderPage {
  items: Order[];
  nextCursor: string | null;
}

/**
 * Orchestrator: triage_high_risk_orders.
 *
 * Lists paid orders above a fraud-score threshold that have not yet
 * shipped. Used by an analyst (or LLM agent) to decide whether to hold
 * fulfilment, request manual review, or release.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const threshold = Math.max(0, Math.min(100, body.fraudScoreThreshold ?? 70));
  const auth = request.headers.get("authorization") ?? "";

  const flagged: Order[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", status: "paid" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<OrderPage>(context, `/orders?${qs}`, {
      headers: { authorization: auth },
    });
    for (const o of page.items) {
      if (o.fraudScore >= threshold && !o.shippedAt) {
        flagged.push(o);
      }
    }
    cursor = page.nextCursor;
    if (flagged.length > 1000) break;
  } while (cursor);

  return new Response(
    JSON.stringify({
      threshold,
      count: flagged.length,
      orders: flagged,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
