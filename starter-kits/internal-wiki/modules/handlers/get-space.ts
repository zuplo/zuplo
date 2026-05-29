import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { spaceRepository } from "../repositories/spaces.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const space = await spaceRepository.get(tenantId, id);
  if (!space) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Space not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(space), {
    headers: { "content-type": "application/json" },
  });
}
