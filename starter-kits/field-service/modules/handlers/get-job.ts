import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { jobRepository } from "../repositories/jobs.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const job = await jobRepository.get(tenantId, id);
  if (!job) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Job not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(job), {
    headers: { "content-type": "application/json" },
  });
}
