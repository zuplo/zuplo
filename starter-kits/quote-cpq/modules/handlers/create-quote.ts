import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { quoteRepository } from "../repositories/quotes.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    dealId: string;
    customerId: string;
    ownerEmail: string;
    currency?: string;
    validUntil: string;
    terms?: string;
  };

  const created = await quoteRepository.create(tenantId, {
    dealId: body.dealId,
    customerId: body.customerId,
    ownerEmail: body.ownerEmail,
    status: "draft",
    subtotalCents: 0,
    discountCents: 0,
    totalCents: 0,
    currency: body.currency ?? "USD",
    validUntil: body.validUntil,
    sentAt: null,
    acceptedAt: null,
    terms: body.terms ?? "",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
