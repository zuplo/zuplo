import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Quote } from "../repositories/quotes.ts";

interface Body {
  quoteId: string;
  thresholdPercent?: number;
}

/**
 * Orchestrator: route_for_discount_approval.
 *
 * Inspects a quote's effective discount % and decides whether it needs
 * deal-desk approval. The default threshold is 20% — anything beyond that
 * is flagged with a reason the LLM can present to the rep.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const threshold = body.thresholdPercent ?? 20;

  const quote = await invokeJson<Quote>(context, `/quotes/${body.quoteId}`, {
    headers: { authorization: auth },
  });

  const effectivePercent =
    quote.subtotalCents > 0
      ? Math.round((quote.discountCents / quote.subtotalCents) * 10000) / 100
      : 0;

  const requiresApproval = effectivePercent >= threshold;
  return new Response(
    JSON.stringify({
      quoteId: quote.id,
      effectiveDiscountPercent: effectivePercent,
      thresholdPercent: threshold,
      requiresApproval,
      reason: requiresApproval
        ? `Discount of ${effectivePercent}% meets or exceeds the ${threshold}% approval threshold`
        : `Discount of ${effectivePercent}% is below the ${threshold}% approval threshold`,
      subtotalCents: quote.subtotalCents,
      discountCents: quote.discountCents,
      totalCents: quote.totalCents,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
