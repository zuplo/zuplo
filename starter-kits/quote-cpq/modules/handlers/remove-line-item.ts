import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { lineItemRepository } from "../repositories/line-items.ts";
import { quoteRepository } from "../repositories/quotes.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const lineId = request.params.lineId;

  const line = await lineItemRepository.get(tenantId, lineId);
  if (!line) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Line item not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  try {
    await lineItemRepository.delete(tenantId, lineId);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: err.message } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }

  // Roll back parent totals.
  const quote = await quoteRepository.get(tenantId, line.quoteId);
  if (quote) {
    const grossCents = line.quantity * line.unitPriceCents;
    const newSubtotal = Math.max(0, quote.subtotalCents - grossCents);
    const newTotal = Math.max(0, quote.totalCents - line.totalCents);
    await quoteRepository.update(tenantId, line.quoteId, {
      subtotalCents: newSubtotal,
      totalCents: newTotal,
      discountCents: newSubtotal - newTotal,
    });
  }

  return new Response(null, { status: 204 });
}
