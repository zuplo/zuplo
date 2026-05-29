import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { responseRepository, type Response_ } from "../repositories/responses.ts";

interface Body {
  surveyId: string;
  customerEmail: string;
  score: number;
  comment?: string;
  source?: string;
  segment?: string;
}

function categorize(score: number): Response_["category"] {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await responseRepository.create(tenantId, {
    surveyId: body.surveyId,
    customerEmail: body.customerEmail,
    score: body.score,
    comment: body.comment ?? "",
    category: categorize(body.score),
    respondedAt: new Date().toISOString(),
    source: body.source ?? "api",
    segment: body.segment ?? "unknown",
    followedUp: false,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
