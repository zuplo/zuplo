import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { playbookRunRepository } from "../repositories/playbook-runs.ts";

interface Body {
  playbookId: string;
  accountId: string;
}

/**
 * Start a new playbook run. Status begins `active` at step 0; advance via
 * `complete_playbook_step` until `currentStep === steps.length`.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await playbookRunRepository.create(tenantId, {
    playbookId: body.playbookId,
    accountId: body.accountId,
    status: "active",
    currentStep: 0,
    startedAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
