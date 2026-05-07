import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { surveyRepository } from "../repositories/surveys.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const survey = await surveyRepository.get(tenantId, id);
  if (!survey) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Survey not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(survey), {
    headers: { "content-type": "application/json" },
  });
}
