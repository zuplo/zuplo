import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { subscriptionRepository } from "../repositories/subscriptions.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const sub = await subscriptionRepository.get(tenantId, id);
  if (!sub) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Subscription not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(sub), {
    headers: { "content-type": "application/json" },
  });
}
