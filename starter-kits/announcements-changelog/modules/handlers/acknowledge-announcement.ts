import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { acknowledgementRepository } from "../repositories/announcements.ts";

interface Body {
  announcementId: string;
  employeeEmail: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await acknowledgementRepository.create(tenantId, {
    announcementId: body.announcementId,
    employeeEmail: body.employeeEmail,
    acknowledgedAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
