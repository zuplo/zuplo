import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { campaignRepository } from "../repositories/campaigns.ts";

interface Body {
  name: string;
  goalCents: number;
  startDate: string;
  endDate: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const created = await campaignRepository.create(tenantId, {
    name: body.name,
    goalCents: body.goalCents,
    startDate: body.startDate,
    endDate: body.endDate,
    raisedCents: 0,
    donorCount: 0,
    status: "active",
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
