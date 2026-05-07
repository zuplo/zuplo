import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { findingRepository, type Finding } from "../repositories/evidence.ts";

interface Body {
  auditCycleId: string;
  controlId: string;
  severity: Finding["severity"];
  description: string;
  owner: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await findingRepository.create(tenantId, {
    auditCycleId: body.auditCycleId,
    controlId: body.controlId,
    severity: body.severity,
    description: body.description,
    status: "open",
    closedAt: null,
    owner: body.owner,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
