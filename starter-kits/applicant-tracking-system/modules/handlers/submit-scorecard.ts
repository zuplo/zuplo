import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  scorecardRepository,
  type Scorecard,
} from "../repositories/scorecards.ts";

interface Body {
  interviewId: string;
  applicationId: string;
  interviewerEmail: string;
  ratings: Record<string, number>;
  recommendation: Scorecard["recommendation"];
  notes: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await scorecardRepository.create(tenantId, {
    interviewId: body.interviewId,
    applicationId: body.applicationId,
    interviewerEmail: body.interviewerEmail,
    ratings: body.ratings,
    recommendation: body.recommendation,
    notes: body.notes,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
