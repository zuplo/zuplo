import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { licenseRepository } from "../repositories/apps.ts";

interface Body {
  saasAppSlug: string;
  employeeEmail: string;
  role: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await licenseRepository.create(tenantId, {
    saasAppSlug: body.saasAppSlug,
    employeeEmail: body.employeeEmail,
    role: body.role,
    assignedAt: new Date().toISOString(),
    removedAt: null,
    lastActiveAt: null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
