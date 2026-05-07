import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { submissionRepository } from "../repositories/submissions.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const submission = await submissionRepository.get(tenantId, id);
  if (!submission) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Submission not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(submission), {
    headers: { "content-type": "application/json" },
  });
}
