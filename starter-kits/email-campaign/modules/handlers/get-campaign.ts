import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { campaignRepository } from "../repositories/campaigns.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const campaign = await campaignRepository.get(tenantId, id);
  if (!campaign) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Campaign not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(campaign), {
    headers: { "content-type": "application/json" },
  });
}
