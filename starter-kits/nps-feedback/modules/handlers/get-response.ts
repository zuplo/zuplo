import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { responseRepository } from "../repositories/responses.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const r = await responseRepository.get(tenantId, id);
  if (!r) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Response not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(r), {
    headers: { "content-type": "application/json" },
  });
}
