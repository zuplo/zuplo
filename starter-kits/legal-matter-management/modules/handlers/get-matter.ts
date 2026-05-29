import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { matterRepository } from "../repositories/matters.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const matter = await matterRepository.get(tenantId, id);
  if (!matter) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Matter not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(matter), {
    headers: { "content-type": "application/json" },
  });
}
