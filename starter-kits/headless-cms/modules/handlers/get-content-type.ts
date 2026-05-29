import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { contentTypeRepository } from "../repositories/entries.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const ct = await contentTypeRepository.get(tenantId, id);
  if (!ct) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Content type not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(ct), {
    headers: { "content-type": "application/json" },
  });
}
