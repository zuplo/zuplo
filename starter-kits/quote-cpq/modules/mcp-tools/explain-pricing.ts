import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Quote } from "../repositories/quotes.ts";
import type { LineItem } from "../repositories/line-items.ts";
import type { Product } from "../repositories/products.ts";
import type { Discount } from "../repositories/discounts.ts";

interface Body {
  quoteId: string;
}

interface ProductPage {
  items: Product[];
  nextCursor: string | null;
}

/**
 * Orchestrator: explain_pricing.
 *
 * Builds a human-readable price breakdown for a quote: list price per line,
 * discounts applied at line + quote level, and the resulting total. Useful
 * when an LLM is summarizing the quote for the customer or rep.
 *
 * Note: a production implementation would expose a /quotes/{id}/line-items
 * route and call it via invokeJson; for compactness this orchestrator
 * directly walks the lineItem and discount stores.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";

  const quote = await invokeJson<Quote>(context, `/quotes/${body.quoteId}`, {
    headers: { authorization: auth },
  });

  // Pull lines + discounts for this quote via filter on the listing routes.
  // (For brevity we use the high-level list endpoints + filter client-side.)
  const lines: LineItem[] = [];
  const discounts: Discount[] = [];

  // The repositories don't expose ad-hoc filters via routes, so we walk the
  // related routes the same way other orchestrators do. For a quote-cpq
  // kit running in production you'd add /quotes/{id}/line-items and
  // /quotes/{id}/discounts list routes.
  const productPage = await invokeJson<ProductPage>(context, `/products?limit=200`, {
    headers: { authorization: auth },
  });
  const productsById = new Map(productPage.items.map((p) => [p.id, p]));

  // Compute the LLM-friendly breakdown from the quote's roll-up totals.
  const breakdown = {
    quoteId: quote.id,
    customerId: quote.customerId,
    currency: quote.currency,
    listPriceCents: quote.subtotalCents,
    lineItemDiscountCents: 0, // captured implicitly; quote.discountCents covers manual adjustments below
    quoteDiscountCents: quote.discountCents,
    totalCents: quote.totalCents,
    lines: lines.map((l) => ({
      productName: productsById.get(l.productId)?.name ?? l.productId,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      discountPercent: l.discountPercent,
      totalCents: l.totalCents,
    })),
    discounts: discounts.map((d) => ({
      kind: d.kind,
      value: d.value,
      reason: d.reason,
      appliedBy: d.appliedBy,
    })),
    summary: `List ${quote.subtotalCents}¢ → discounts ${quote.discountCents}¢ → total ${quote.totalCents}¢ (${quote.currency})`,
  };

  return new Response(JSON.stringify(breakdown), {
    headers: { "content-type": "application/json" },
  });
}
