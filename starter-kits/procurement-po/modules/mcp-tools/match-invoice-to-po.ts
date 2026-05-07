import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { PurchaseOrder } from "../repositories/purchase-orders.ts";

interface Body {
  vendorId: string;
  amountCents: number;
  tolerancePercent?: number;
}

interface PurchaseOrderPage {
  items: PurchaseOrder[];
  nextCursor: string | null;
}

/**
 * Orchestrator: match_invoice_to_po.
 *
 * Given an incoming invoice's vendor and amount, finds open POs from the
 * same vendor with totals within tolerance (default 5%). Returns ranked
 * candidates so a clerk (or LLM) can confirm the 3-way match.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const tolerance = (body.tolerancePercent ?? 5) / 100;

  const matches: Array<{ po: PurchaseOrder; deltaCents: number; deltaPercent: number }> = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<PurchaseOrderPage>(context, `/purchase-orders?${qs}`, {
      headers: { authorization: auth },
    });
    for (const po of page.items) {
      if (po.vendorId !== body.vendorId) continue;
      if (po.status === "closed") continue;
      const delta = body.amountCents - po.totalCents;
      const deltaPct = po.totalCents > 0 ? Math.abs(delta) / po.totalCents : 1;
      if (deltaPct <= tolerance) {
        matches.push({ po, deltaCents: delta, deltaPercent: deltaPct });
      }
    }
    cursor = page.nextCursor;
    if (matches.length > 50) break;
  } while (cursor);

  matches.sort((a, b) => Math.abs(a.deltaCents) - Math.abs(b.deltaCents));

  return new Response(JSON.stringify({ count: matches.length, matches }), {
    headers: { "content-type": "application/json" },
  });
}
