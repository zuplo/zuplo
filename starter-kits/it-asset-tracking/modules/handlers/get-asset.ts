import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { assetRepository } from "../repositories/assets.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const asset = await assetRepository.get(tenantId, id);
  if (!asset) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Asset not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(asset), {
    headers: { "content-type": "application/json" },
  });
}
