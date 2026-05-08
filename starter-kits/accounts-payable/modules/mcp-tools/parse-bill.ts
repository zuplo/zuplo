import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { parseBillFromUrl } from "../integrations/mindee.ts";

/**
 * Orchestrator MCP tool: parse_bill.
 *
 * Run a vendor bill PDF through Mindee OCR and return normalized fields the
 * LLM can drop into create_bill (vendor, amountCents, currency, dueDate-ish,
 * billNumber).
 */

interface Body {
  attachmentUrl: string;
}

export default async function (request: ZuploRequest, _context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.attachmentUrl) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "attachmentUrl is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const parsed = await parseBillFromUrl(body.attachmentUrl);
  return new Response(
    JSON.stringify({
      vendor: parsed.vendor,
      amountCents: parsed.amountCents,
      currency: parsed.currency,
      date: parsed.date,
      billNumber: parsed.receiptNumber,
      category: parsed.category,
      confidence: parsed.confidence,
      ready:
        parsed.vendor != null &&
        parsed.amountCents != null &&
        parsed.date != null &&
        parsed.confidence > 0.5,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
