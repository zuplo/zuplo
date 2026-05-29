import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { visitorRepository } from "../repositories/touchpoints.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const visitor = await visitorRepository.get(tenantId, id);
  if (!visitor) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Visitor not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(visitor), {
    headers: { "content-type": "application/json" },
  });
}
