import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { parseReceiptFromUrl } from "../integrations/mindee.ts";

/**
 * Orchestrator MCP tool: parse_receipt.
 *
 * Takes a publicly-reachable receipt image URL, calls Mindee Expense Receipts
 * v5, and returns a normalized payload an LLM can stuff straight into
 * `create_expense`. The LLM never has to see raw OCR JSON.
 */

interface Body {
  receiptUrl: string;
}

export default async function (request: ZuploRequest, _context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.receiptUrl || typeof body.receiptUrl !== "string") {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "receiptUrl is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const parsed = await parseReceiptFromUrl(body.receiptUrl);
  return new Response(
    JSON.stringify({
      merchant: parsed.merchant,
      amountCents: parsed.amountCents,
      currency: parsed.currency,
      date: parsed.date,
      category: parsed.category,
      receiptNumber: parsed.receiptNumber,
      confidence: parsed.confidence,
      ready:
        parsed.merchant != null &&
        parsed.amountCents != null &&
        parsed.date != null &&
        parsed.confidence > 0.5,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
