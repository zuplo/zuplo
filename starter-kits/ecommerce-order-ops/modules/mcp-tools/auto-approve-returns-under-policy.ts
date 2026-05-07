import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Return } from "../repositories/returns.ts";
import type { Order } from "../repositories/orders.ts";

interface Body {
  maxValueCents?: number;
  daysSincePurchase?: number;
}

interface ReturnPage {
  items: Return[];
  nextCursor: string | null;
}

/**
 * Orchestrator: auto_approve_returns_under_policy.
 *
 * Walks `requested` returns, joins each to its parent order, applies a
 * simple policy (order total under threshold + within window since
 * purchase), and bulk-approves matching returns through `approve_return`.
 * Returns counts plus the list of returns it approved and skipped.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const maxValueCents = body.maxValueCents ?? 10000;
  const daysSincePurchase = Math.max(1, Math.min(365, body.daysSincePurchase ?? 30));
  const cutoff = new Date(Date.now() - daysSincePurchase * 86400000).toISOString();
  const auth = request.headers.get("authorization") ?? "";

  // 1) walk requested returns
  const candidates: Return[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", status: "requested" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ReturnPage>(context, `/returns?${qs}`, {
      headers: { authorization: auth },
    });
    candidates.push(...page.items);
    cursor = page.nextCursor;
    if (candidates.length > 1000) break;
  } while (cursor);

  // 2) per return, fetch the order and apply policy
  const approved: Return[] = [];
  const skipped: Array<{ ret: Return; reason: string }> = [];

  for (const r of candidates) {
    let order: Order | null = null;
    try {
      order = await invokeJson<Order>(
        context,
        `/orders/${encodeURIComponent(r.orderId)}`,
        { headers: { authorization: auth } },
      );
    } catch {
      skipped.push({ ret: r, reason: "order not found" });
      continue;
    }

    if (order.totalCents > maxValueCents) {
      skipped.push({ ret: r, reason: `order total ${order.totalCents} > ${maxValueCents}` });
      continue;
    }
    if (order.placedAt < cutoff) {
      skipped.push({ ret: r, reason: `placed before ${cutoff}` });
      continue;
    }

    const updated = await invokeJson<Return>(
      context,
      `/returns/${encodeURIComponent(r.id)}/approve`,
      {
        method: "POST",
        headers: { authorization: auth },
      },
    );
    approved.push(updated);
  }

  return new Response(
    JSON.stringify({
      maxValueCents,
      daysSincePurchase,
      candidatesScanned: candidates.length,
      approvedCount: approved.length,
      skippedCount: skipped.length,
      approved,
      skipped,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
