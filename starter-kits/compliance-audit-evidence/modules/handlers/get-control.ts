import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { controlRepository } from "../repositories/evidence.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const control = await controlRepository.get(tenantId, id);
  if (!control) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Control not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(control), {
    headers: { "content-type": "application/json" },
  });
}
