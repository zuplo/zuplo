import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { listingRepository } from "../repositories/listings.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const listing = await listingRepository.get(tenantId, id);
  if (!listing) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Listing not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(listing), {
    headers: { "content-type": "application/json" },
  });
}
