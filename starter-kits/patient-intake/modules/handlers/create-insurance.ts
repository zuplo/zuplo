import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { insuranceRepository } from "../repositories/insurance.ts";

interface Body {
  patientId: string;
  payerName: string;
  planName: string;
  memberId: string;
  groupNumber: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await insuranceRepository.create(tenantId, {
    patientId: body.patientId,
    payerName: body.payerName,
    planName: body.planName,
    memberId: body.memberId,
    groupNumber: body.groupNumber,
    verified: false,
    verifiedAt: null,
    eligibility: "unknown",
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
