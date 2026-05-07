import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { projectRepository } from "../repositories/projects.ts";

/**
 * Soft-delete by moving the project to status=archived.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;

  try {
    await projectRepository.update(tenantId, id, { status: "archived" });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({
          error: { type: "not_found", message: err.message },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }

  return new Response(null, { status: 204 });
}
