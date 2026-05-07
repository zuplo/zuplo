import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { leadRepository } from "../repositories/leads.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const lead = await leadRepository.get(tenantId, id);
  if (!lead) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Lead not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(lead), {
    headers: { "content-type": "application/json" },
  });
}
