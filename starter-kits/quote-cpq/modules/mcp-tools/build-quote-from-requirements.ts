import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Quote } from "../repositories/quotes.ts";
import type { LineItem } from "../repositories/line-items.ts";
import type { Product } from "../repositories/products.ts";
import type { PricingRule } from "../repositories/pricing-rules.ts";

interface Body {
  dealId: string;
  customerId: string;
  ownerEmail: string;
  productIds: string[];
  quantities: number[];
  customerSegment?: string;
  validUntil?: string;
}

interface ProductPage {
  items: Product[];
  nextCursor: string | null;
}

interface PricingRulePage {
  items: PricingRule[];
  nextCursor: string | null;
}

/**
 * Orchestrator: build_quote_from_requirements.
 *
 * Composes the multi-step workflow a sales rep would otherwise script by
 * hand: create the parent quote, add a line for every requested product,
 * evaluate pricing rules and apply matching discounts. Returns the priced
 * Quote plus the LineItems and rules-applied trace so the LLM can explain.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";
  if (!body.productIds || !body.quantities || body.productIds.length !== body.quantities.length) {
    return new Response(
      JSON.stringify({ error: { type: "invalid_body", message: "productIds and quantities must be the same length" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // Pull catalog and pricing rules.
  const productPage = await invokeJson<ProductPage>(context, `/products?limit=200`, {
    headers: { authorization: auth },
  });
  const productsById = new Map(productPage.items.map((p) => [p.id, p]));

  const rulePage = await invokeJson<PricingRulePage>(context, `/pricing-rules?limit=200`, {
    headers: { authorization: auth },
  });

  // Create the parent quote.
  const validUntil =
    body.validUntil ?? new Date(Date.now() + 30 * 86400000).toISOString();
  const quote = await invokeJson<Quote>(context, `/quotes`, {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify({
      dealId: body.dealId,
      customerId: body.customerId,
      ownerEmail: body.ownerEmail,
      currency: "USD",
      validUntil,
      terms: "Net 30",
    }),
  });

  // Build each line; evaluate rules per product.
  const lines: LineItem[] = [];
  const rulesApplied: Array<{ productId: string; ruleId: string; ruleName: string; discountPercent: number }> = [];

  for (let i = 0; i < body.productIds.length; i++) {
    const productId = body.productIds[i];
    const quantity = body.quantities[i];
    const product = productsById.get(productId);
    if (!product) continue;

    // Find matching pricing rule (highest discount wins, simplest match).
    let chosenRule: PricingRule | null = null;
    for (const rule of rulePage.items) {
      if (rule.productId !== productId) continue;
      const segment = (rule.conditions as { customerSegment?: string }).customerSegment;
      const matchesSegment = !segment || segment === body.customerSegment;
      if (!matchesSegment) continue;
      const minQty = (rule.conditions as { minQuantity?: number }).minQuantity ?? 0;
      if (quantity < minQty) continue;
      if (!chosenRule || rule.discountPercent > chosenRule.discountPercent) {
        chosenRule = rule;
      }
    }

    const discountPercent = chosenRule?.discountPercent ?? 0;
    if (chosenRule) {
      rulesApplied.push({
        productId,
        ruleId: chosenRule.id,
        ruleName: chosenRule.name,
        discountPercent,
      });
    }

    const line = await invokeJson<LineItem>(context, `/quotes/${quote.id}/line-items`, {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify({
        productId,
        quantity,
        unitPriceCents: product.listPriceCents,
        discountPercent,
      }),
    });
    lines.push(line);
  }

  // Re-fetch the rolled-up quote.
  const finalQuote = await invokeJson<Quote>(context, `/quotes/${quote.id}`, {
    headers: { authorization: auth },
  });

  return new Response(
    JSON.stringify({ quote: finalQuote, lineItems: lines, rulesApplied }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
