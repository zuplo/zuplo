import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { reviewRepository } from "../repositories/reviews.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const cycleId = url.searchParams.get("cycleId");
  const revieweeEmail = url.searchParams.get("revieweeEmail");
  const reviewerEmail = url.searchParams.get("reviewerEmail");
  const status = url.searchParams.get("status");
  const kind = url.searchParams.get("kind");

  const page = await reviewRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "createdAt", direction: "desc" },
  });

  let items = page.items;
  if (cycleId) items = items.filter((r) => r.cycleId === cycleId);
  if (revieweeEmail) items = items.filter((r) => r.revieweeEmail === revieweeEmail);
  if (reviewerEmail) items = items.filter((r) => r.reviewerEmail === reviewerEmail);
  if (status) items = items.filter((r) => r.status === status);
  if (kind) items = items.filter((r) => r.kind === kind);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
