import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { creditRepository } from "../repositories/credits.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    repEmail: string;
    dealId: string;
    amountCents: number;
    period: string;
    splitPercent?: number;
    dealStatus?: string;
  };

  const created = await creditRepository.create(tenantId, {
    repEmail: body.repEmail,
    dealId: body.dealId,
    amountCents: body.amountCents,
    period: body.period,
    splitPercent: body.splitPercent ?? 100,
    creditedAt: new Date().toISOString(),
    dealStatus: body.dealStatus ?? "closed_won",
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
