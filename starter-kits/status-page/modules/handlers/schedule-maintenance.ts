import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { maintenanceRepository } from "../repositories/maintenance.ts";

interface Body {
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  affectedComponentSlugs?: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await maintenanceRepository.create(tenantId, {
    title: body.title,
    scheduledStart: body.scheduledStart,
    scheduledEnd: body.scheduledEnd,
    affectedComponentSlugs: body.affectedComponentSlugs ?? [],
    status: "scheduled",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
