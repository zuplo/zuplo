import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { usageRepository } from "../repositories/apps.ts";

interface Body {
  saasAppSlug: string;
  employeeEmail: string;
  periodStart: string;
  periodEnd: string;
  sessionCount: number;
  lastSessionAt: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await usageRepository.create(tenantId, {
    saasAppSlug: body.saasAppSlug,
    employeeEmail: body.employeeEmail,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    sessionCount: body.sessionCount,
    lastSessionAt: body.lastSessionAt,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
