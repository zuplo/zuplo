import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { answerRepository, responseRepository, type Answer } from "../repositories/surveys.ts";

interface AnswerInput {
  questionId: string;
  value: unknown;
}

interface Body {
  surveyId: string;
  respondentEmail?: string;
  anonymous?: boolean;
  answers: AnswerInput[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const response = await responseRepository.create(tenantId, {
    surveyId: body.surveyId,
    respondentEmail: body.anonymous ? null : (body.respondentEmail ?? null),
    submittedAt: now,
    anonymous: body.anonymous ?? false,
    createdAt: now,
  });

  const createdAnswers: Answer[] = [];
  for (const a of body.answers ?? []) {
    const created = await answerRepository.create(tenantId, {
      responseId: response.id,
      questionId: a.questionId,
      value: a.value,
      createdAt: now,
    });
    createdAnswers.push(created);
  }

  return new Response(
    JSON.stringify({ response, answers: createdAnswers }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
