import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import type { DealStage } from "../repositories/deals.ts";
import { dealRepository } from "../repositories/deals.ts";

interface Body {
  accountId: string;
  contactId?: string;
  name: string;
  ownerEmail: string;
  stage?: DealStage;
  amountCents: number;
  currency: string;
  expectedCloseDate: string;
  probability?: number;
  source?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();
  const created = await dealRepository.create(tenantId, {
    accountId: body.accountId,
    contactId: body.contactId ?? null,
    name: body.name,
    ownerEmail: body.ownerEmail,
    stage: body.stage ?? "prospect",
    amountCents: body.amountCents,
    currency: body.currency,
    expectedCloseDate: body.expectedCloseDate,
    probability: body.probability ?? 10,
    source: body.source ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
