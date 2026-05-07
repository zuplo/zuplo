import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { experimentRepository } from "../repositories/experiments.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const exp = await experimentRepository.get(tenantId, id);
  if (!exp) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Experiment not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(exp), {
    headers: { "content-type": "application/json" },
  });
}
