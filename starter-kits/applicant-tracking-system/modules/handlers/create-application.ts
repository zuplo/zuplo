import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { applicationRepository } from "../repositories/applications.ts";

interface Body {
  candidateId: string;
  jobId: string;
  source: string;
  resumeUrl?: string;
  score?: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const now = new Date().toISOString();
  const created = await applicationRepository.create(tenantId, {
    candidateId: body.candidateId,
    jobId: body.jobId,
    stage: "applied",
    stageEnteredAt: now,
    source: body.source,
    resumeUrl: body.resumeUrl ?? null,
    score: body.score ?? null,
    createdAt: now,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
