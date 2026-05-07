import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { discountRepository } from "../repositories/discounts.ts";
import { quoteRepository } from "../repositories/quotes.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const quoteId = request.params.id;
  const body = (await request.json()) as {
    kind: "percent" | "flat";
    value: number;
    reason: string;
    appliedBy: string;
  };

  const quote = await quoteRepository.get(tenantId, quoteId);
  if (!quote) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Quote not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const discount = await discountRepository.create(tenantId, {
    quoteId,
    kind: body.kind,
    value: body.value,
    reason: body.reason,
    appliedBy: body.appliedBy,
    appliedAt: new Date().toISOString(),
  });

  // Apply discount to quote totals.
  let extraDiscountCents: number;
  if (body.kind === "percent") {
    extraDiscountCents = Math.round(quote.totalCents * (body.value / 100));
  } else {
    extraDiscountCents = Math.min(quote.totalCents, Math.max(0, body.value));
  }
  await quoteRepository.update(tenantId, quoteId, {
    discountCents: quote.discountCents + extraDiscountCents,
    totalCents: Math.max(0, quote.totalCents - extraDiscountCents),
  });

  return new Response(JSON.stringify(discount), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
