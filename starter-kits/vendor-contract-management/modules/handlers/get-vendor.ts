import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { vendorRepository } from "../repositories/contracts.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const vendor = await vendorRepository.get(tenantId, id);
  if (!vendor) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Vendor not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(vendor), {
    headers: { "content-type": "application/json" },
  });
}
