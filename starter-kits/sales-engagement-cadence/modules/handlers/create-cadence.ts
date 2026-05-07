import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { cadenceRepository, type CadenceStep } from "../repositories/cadences.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as { name: string; steps: CadenceStep[] };

  const created = await cadenceRepository.create(tenantId, {
    name: body.name,
    steps: body.steps,
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
