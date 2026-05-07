import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  renewalRepository,
  type RenewalOpportunity,
} from "../repositories/renewals.ts";

interface Body {
  contractId: string;
  accountId: string;
  ownerEmail: string;
  renewsOn: string;
  currentArrCents: number;
  proposedArrCents?: number;
  status?: RenewalOpportunity["status"];
  riskTier?: RenewalOpportunity["riskTier"];
  forecastCategory?: RenewalOpportunity["forecastCategory"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await renewalRepository.create(tenantId, {
    contractId: body.contractId,
    accountId: body.accountId,
    ownerEmail: body.ownerEmail,
    renewsOn: body.renewsOn,
    currentArrCents: body.currentArrCents,
    proposedArrCents: body.proposedArrCents ?? body.currentArrCents,
    status: body.status ?? "upcoming",
    riskTier: body.riskTier ?? "low",
    forecastCategory: body.forecastCategory ?? "pipeline",
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
