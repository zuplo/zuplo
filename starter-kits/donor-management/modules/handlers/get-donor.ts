import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { donorRepository } from "../repositories/donors.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const donor = await donorRepository.get(tenantId, id);
  if (!donor) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Donor not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(donor), { headers: { "content-type": "application/json" } });
}
