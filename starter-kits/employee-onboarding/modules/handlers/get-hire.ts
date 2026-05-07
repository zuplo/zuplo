import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { hireRepository } from "../repositories/hires.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const hire = await hireRepository.get(tenantId, id);
  if (!hire) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Hire not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(hire), {
    headers: { "content-type": "application/json" },
  });
}
