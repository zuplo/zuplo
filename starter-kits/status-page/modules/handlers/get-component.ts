import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { componentRepository } from "../repositories/components.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const component = await componentRepository.get(tenantId, id);
  if (!component) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Component not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(component), {
    headers: { "content-type": "application/json" },
  });
}
