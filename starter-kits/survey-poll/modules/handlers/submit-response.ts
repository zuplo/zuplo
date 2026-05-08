import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  answerRepository,
  questionRepository,
  responseRepository,
  surveyRepository,
  type Answer,
} from "../repositories/surveys.ts";
import { sendSlackMessage } from "../integrations/slack.ts";

interface AnswerInput {
  questionId: string;
  value: unknown;
}

interface Body {
  surveyId: string;
  respondentEmail?: string;
  anonymous?: boolean;
  answers: AnswerInput[];
  /** When true, suppress detractor Slack alert. */
  silent?: boolean;
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

  // Detractor scan: if any NPS-kind question scored 0–6, alert Slack so a
  // human can intervene. Best-effort; failures are logged, not surfaced.
  if (!body.silent) {
    try {
      const nps = await detectDetractor(tenantId, body.surveyId, createdAnswers);
      if (nps) {
        const survey = await surveyRepository
          .get(tenantId, body.surveyId)
          .catch(() => null);
        const who =
          response.anonymous || !response.respondentEmail
            ? "an anonymous respondent"
            : response.respondentEmail;
        const surveyTitle = survey?.title ?? body.surveyId;
        await sendSlackMessage({
          text: `:warning: *Detractor on "${surveyTitle}"* — score *${nps.score}/10* from ${who} (response \`${response.id}\`)`,
        });
      }
    } catch (err) {
      context.log.warn(`Detractor alert failed: ${(err as Error).message}`);
    }
  }

  return new Response(
    JSON.stringify({ response, answers: createdAnswers }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}

interface Detractor {
  score: number;
  questionId: string;
}

async function detectDetractor(
  tenantId: string,
  surveyId: string,
  answers: Answer[],
): Promise<Detractor | null> {
  // Look for any NPS-kind question with a score 0–6.
  for (const a of answers) {
    const q = await questionRepository.get(tenantId, a.questionId).catch(() => null);
    if (!q || q.surveyId !== surveyId || q.kind !== "nps") continue;
    const score = typeof a.value === "number" ? a.value : Number(a.value);
    if (Number.isFinite(score) && score >= 0 && score <= 6) {
      return { score, questionId: a.questionId };
    }
  }
  return null;
}
