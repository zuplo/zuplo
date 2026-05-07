import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { campaignRepository } from "../repositories/campaigns.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;

  const existing = await campaignRepository.get(tenantId, id);
  if (!existing) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Campaign not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  if (existing.status === "sent") {
    return new Response(
      JSON.stringify({
        error: { type: "invalid_state", message: "Campaign already sent — cannot cancel" },
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }

  try {
    const updated = await campaignRepository.update(tenantId, id, { status: "canceled" });
    return new Response(JSON.stringify(updated), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: err.message } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }
}
