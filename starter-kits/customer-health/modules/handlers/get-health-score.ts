import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { healthScoreRepository } from "../repositories/health-scores.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const score = await healthScoreRepository.get(tenantId, id);
  if (!score) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Health score not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(score), {
    headers: { "content-type": "application/json" },
  });
}
