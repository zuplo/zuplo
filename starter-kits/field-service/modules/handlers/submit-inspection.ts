import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  inspectionRepository,
  type InspectionFinding,
} from "../repositories/inspections.ts";

interface Body {
  jobId: string;
  kind: string;
  performedAt?: string;
  findings: InspectionFinding[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await inspectionRepository.create(tenantId, {
    jobId: body.jobId,
    kind: body.kind,
    performedAt: body.performedAt ?? new Date().toISOString(),
    findings: body.findings,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
