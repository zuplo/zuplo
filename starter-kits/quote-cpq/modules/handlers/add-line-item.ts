import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { quoteRepository } from "../repositories/quotes.ts";
import { lineItemRepository } from "../repositories/line-items.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const quoteId = request.params.id;
  const body = (await request.json()) as {
    productId: string;
    quantity: number;
    unitPriceCents: number;
    discountPercent?: number;
  };

  const quote = await quoteRepository.get(tenantId, quoteId);
  if (!quote) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Quote not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const discountPercent = body.discountPercent ?? 0;
  const grossCents = body.quantity * body.unitPriceCents;
  const totalCents = Math.round(grossCents * (1 - discountPercent / 100));

  const line = await lineItemRepository.create(tenantId, {
    quoteId,
    productId: body.productId,
    quantity: body.quantity,
    unitPriceCents: body.unitPriceCents,
    discountPercent,
    totalCents,
  });

  // Roll up totals on the parent quote.
  try {
    const newSubtotal = quote.subtotalCents + grossCents;
    const newTotal = quote.totalCents + totalCents;
    await quoteRepository.update(tenantId, quoteId, {
      subtotalCents: newSubtotal,
      totalCents: newTotal,
      discountCents: newSubtotal - newTotal,
    });
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }

  return new Response(JSON.stringify(line), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
