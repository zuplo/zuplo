import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { playbookRunRepository } from "../repositories/playbook-runs.ts";
import { playbookRepository } from "../repositories/playbooks.ts";

/**
 * Advance the run's `currentStep` by one. When the new index meets the
 * playbook's step count the run transitions to `completed`.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;

  try {
    const run = await playbookRunRepository.get(tenantId, id);
    if (!run) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: "PlaybookRun not found" } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    const playbook = await playbookRepository.get(tenantId, run.playbookId);
    const total = playbook?.steps.length ?? Number.POSITIVE_INFINITY;
    const nextStep = run.currentStep + 1;
    const status: "active" | "completed" =
      nextStep >= total ? "completed" : "active";

    const updated = await playbookRunRepository.update(tenantId, id, {
      currentStep: nextStep,
      status,
    });
    return new Response(JSON.stringify(updated), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: err.message } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }
}
