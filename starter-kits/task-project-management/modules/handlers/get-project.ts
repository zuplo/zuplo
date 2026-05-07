import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { projectRepository } from "../repositories/projects.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const project = await projectRepository.get(tenantId, id);
  if (!project) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Project not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(project), {
    headers: { "content-type": "application/json" },
  });
}
