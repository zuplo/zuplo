import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { reviewRepository } from "../repositories/reviews.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const review = await reviewRepository.get(tenantId, id);
  if (!review) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Review not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(review), {
    headers: { "content-type": "application/json" },
  });
}
