import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { riskAssessmentRepository, type RiskAssessment } from "../repositories/contracts.ts";

interface Body {
  vendorId: string;
  kind: RiskAssessment["kind"];
  level: RiskAssessment["level"];
  notes: string;
  assessedBy: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await riskAssessmentRepository.create(tenantId, {
    vendorId: body.vendorId,
    kind: body.kind,
    level: body.level,
    notes: body.notes,
    assessedAt: new Date().toISOString(),
    assessedBy: body.assessedBy,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
