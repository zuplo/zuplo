import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  reviewCycleRepository,
  type ReviewCycle,
} from "../repositories/review-cycles.ts";

interface Body {
  name: string;
  startDate: string;
  endDate: string;
  kind: ReviewCycle["kind"];
  status?: ReviewCycle["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await reviewCycleRepository.create(tenantId, {
    name: body.name,
    startDate: body.startDate,
    endDate: body.endDate,
    kind: body.kind,
    status: body.status ?? "open",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
