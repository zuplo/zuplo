import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  answerRepository,
  questionRepository,
  responseRepository,
} from "../repositories/surveys.ts";

interface PerQuestion {
  questionId: string;
  prompt: string;
  kind: string;
  responseCount: number;
  // For choice/rating/nps: distribution keyed by stringified value.
  distribution: Record<string, number>;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;

  // Pull every question on this survey.
  const allQuestions = await questionRepository.list(tenantId, { limit: 200 });
  const questions = allQuestions.items.filter((q) => q.surveyId === id);

  // Pull every response on this survey.
  const allResponses = await responseRepository.list(tenantId, { limit: 200 });
  const responses = allResponses.items.filter((r) => r.surveyId === id);
  const responseIds = new Set(responses.map((r) => r.id));

  // Pull every answer attached to those responses.
  const allAnswers = await answerRepository.list(tenantId, { limit: 200 });
  const answers = allAnswers.items.filter((a) => responseIds.has(a.responseId));

  const summary: PerQuestion[] = questions.map((q) => {
    const matched = answers.filter((a) => a.questionId === q.id);
    const distribution: Record<string, number> = {};
    for (const a of matched) {
      const v = a.value;
      if (Array.isArray(v)) {
        // multi_choice: count each selected option.
        for (const item of v) {
          const k = String(item);
          distribution[k] = (distribution[k] ?? 0) + 1;
        }
      } else if (q.kind === "text") {
        // For text questions, just count submissions, not text-as-key.
        distribution["__text"] = (distribution["__text"] ?? 0) + 1;
      } else {
        const k = v == null ? "null" : String(v);
        distribution[k] = (distribution[k] ?? 0) + 1;
      }
    }
    return {
      questionId: q.id,
      prompt: q.prompt,
      kind: q.kind,
      responseCount: matched.length,
      distribution,
    };
  });

  return new Response(
    JSON.stringify({
      surveyId: id,
      responseTotal: responses.length,
      questions: summary,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
