import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { topicRepository } from "../repositories/topics.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const topic = await topicRepository.get(tenantId, id);
  if (!topic) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Topic not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(topic), {
    headers: { "content-type": "application/json" },
  });
}
