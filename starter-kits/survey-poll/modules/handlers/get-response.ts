import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { answerRepository, responseRepository } from "../repositories/surveys.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const response = await responseRepository.get(tenantId, id);
  if (!response) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Response not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  // Hydrate the answers for this response.
  const answers = await answerRepository.list(tenantId, { limit: 200 });
  const matched = answers.items.filter((a) => a.responseId === id);
  return new Response(JSON.stringify({ response, answers: matched }), {
    headers: { "content-type": "application/json" },
  });
}
