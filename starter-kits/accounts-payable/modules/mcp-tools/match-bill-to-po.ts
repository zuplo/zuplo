import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Bill } from "../repositories/bills.ts";

/**
 * Orchestrator MCP tool: match_bill_to_po.
 *
 * For a given bill, finds candidate POs (bills with a `poNumber` set) for the
 * same vendor whose amounts match within ±5%. This kit doesn't ship a separate
 * `PO` entity — open POs are represented as `Bill` records with status=draft
 * and a poNumber, which a real-world implementation would specialise.
 */

interface Body {
  billId: string;
}

interface BillPage { items: Bill[]; nextCursor: string | null }

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.billId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "billId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const bills: Bill[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<BillPage>(context, `/bills?${qs}`, { headers: auth });
    bills.push(...page.items);
    cursor = page.nextCursor;
    if (bills.length > 50000) break;
  } while (cursor);

  const target = bills.find((b) => b.id === body.billId);
  if (!target) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Bill not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const tolerance = 0.05;
  const candidates = bills
    .filter((b) => b.id !== target.id)
    .filter((b) => b.vendorId === target.vendorId)
    .filter((b) => b.poNumber !== null)
    .filter((b) => b.status === "draft")
    .map((b) => {
      const diff = Math.abs(b.amountCents - target.amountCents);
      const ratio = target.amountCents > 0 ? diff / target.amountCents : 1;
      return { bill: b, amountDiffCents: diff, amountDiffRatio: ratio };
    })
    .filter((c) => c.amountDiffRatio <= tolerance)
    .sort((a, b) => a.amountDiffRatio - b.amountDiffRatio);

  return new Response(
    JSON.stringify({
      bill: target,
      candidateCount: candidates.length,
      candidates,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
