import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { projectRepository } from "../repositories/projects.ts";

interface Body {
  name: string;
  clientName: string;
  billingRateUsd: number;
  active?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await projectRepository.create(tenantId, {
    name: body.name,
    clientName: body.clientName,
    billingRateUsd: body.billingRateUsd,
    active: body.active ?? true,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
