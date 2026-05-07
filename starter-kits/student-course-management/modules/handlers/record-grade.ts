import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  gradeRepository,
  type Grade,
} from "../repositories/grades.ts";

interface Body {
  enrollmentId: string;
  lessonId?: string | null;
  kind: Grade["kind"];
  score: number;
  maxScore: number;
  feedback?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await gradeRepository.create(tenantId, {
    enrollmentId: body.enrollmentId,
    lessonId: body.lessonId ?? null,
    kind: body.kind,
    score: body.score,
    maxScore: body.maxScore,
    gradedAt: new Date().toISOString(),
    feedback: body.feedback ?? null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
