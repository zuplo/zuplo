import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { offerRepository } from "../repositories/listings.ts";

interface Body {
  listingId: string;
  leadId: string;
  amountCents: number;
  contingencies?: string[];
  submittedAt?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const created = await offerRepository.create(tenantId, {
    listingId: body.listingId,
    leadId: body.leadId,
    amountCents: body.amountCents,
    contingencies: body.contingencies ?? [],
    status: "submitted",
    submittedAt: body.submittedAt ?? now,
    createdAt: now,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
