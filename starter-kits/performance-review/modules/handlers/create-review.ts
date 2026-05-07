import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  reviewRepository,
  type Review,
} from "../repositories/reviews.ts";

interface Body {
  revieweeEmail: string;
  reviewerEmail: string;
  cycleId: string;
  kind: Review["kind"];
  ratings?: Record<string, number>;
  narrative?: string;
  status?: Review["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await reviewRepository.create(tenantId, {
    revieweeEmail: body.revieweeEmail,
    reviewerEmail: body.reviewerEmail,
    cycleId: body.cycleId,
    kind: body.kind,
    status: body.status ?? "draft",
    ratings: body.ratings ?? {},
    narrative: body.narrative ?? "",
    submittedAt: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
