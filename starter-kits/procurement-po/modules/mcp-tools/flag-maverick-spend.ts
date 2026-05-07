import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { PurchaseRequest } from "../repositories/purchase-requests.ts";

interface PurchaseRequestPage {
  items: PurchaseRequest[];
  nextCursor: string | null;
}

/**
 * Orchestrator: flag_maverick_spend.
 *
 * Surfaces purchase requests that bypass standard policy:
 *   - flagged `rush: true`
 *   - submitted directly without going through approvals (rare combo of submitted + no chain)
 *   - over a soft threshold (default $5k) without justification
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const auth = request.headers.get("authorization") ?? "";

  const flagged: Array<{ request: PurchaseRequest; reasons: string[] }> = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<PurchaseRequestPage>(context, `/purchase-requests?${qs}`, {
      headers: { authorization: auth },
    });
    for (const pr of page.items) {
      const reasons: string[] = [];
      if (pr.rush) reasons.push("marked_rush");
      if (pr.totalCents > 500000 && (!pr.justification || pr.justification.length < 20)) {
        reasons.push("high_amount_thin_justification");
      }
      if (reasons.length > 0) flagged.push({ request: pr, reasons });
    }
    cursor = page.nextCursor;
    if (flagged.length > 500) break;
  } while (cursor);

  return new Response(JSON.stringify({ count: flagged.length, flagged }), {
    headers: { "content-type": "application/json" },
  });
}
