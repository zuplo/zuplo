import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { applicationRepository } from "../repositories/applications.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const application = await applicationRepository.get(tenantId, id);
  if (!application) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Application not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(application), {
    headers: { "content-type": "application/json" },
  });
}
