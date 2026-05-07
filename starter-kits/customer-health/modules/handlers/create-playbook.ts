import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { playbookRepository, type Playbook } from "../repositories/playbooks.ts";

interface Body {
  name: string;
  trigger: Playbook["trigger"];
  steps: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await playbookRepository.create(tenantId, {
    name: body.name,
    trigger: body.trigger,
    steps: body.steps,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
