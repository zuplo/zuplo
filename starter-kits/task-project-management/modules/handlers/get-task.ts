import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { taskRepository } from "../repositories/tasks.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const task = await taskRepository.get(tenantId, id);
  if (!task) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Task not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(task), {
    headers: { "content-type": "application/json" },
  });
}
