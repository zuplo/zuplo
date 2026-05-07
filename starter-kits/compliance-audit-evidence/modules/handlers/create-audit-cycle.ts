import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { auditCycleRepository, type AuditCycle } from "../repositories/evidence.ts";

interface Body {
  frameworkSlug: string;
  name: string;
  startsAt: string;
  endsAt: string;
  auditor: string;
  status?: AuditCycle["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await auditCycleRepository.create(tenantId, {
    frameworkSlug: body.frameworkSlug,
    name: body.name,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    auditor: body.auditor,
    status: body.status ?? "planning",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
