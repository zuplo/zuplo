import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Answer, Cohort, Response_ } from "../repositories/surveys.ts";

/**
 * Orchestrator MCP tool: compare_cohorts.
 *
 * Returns answer distributions for two named cohorts on the same question.
 * Cohort membership is derived from `Cohort.criteria.emails[]` if present —
 * the LLM caller can refine the matching logic if needed.
 */

interface Body {
  surveyId: string;
  cohortSlugA: string;
  cohortSlugB: string;
  questionId: string;
}

interface ResponseDetail {
  response: Response_;
  answers: Answer[];
}

interface ResponsePage {
  items: Response_[];
  nextCursor: string | null;
}

interface CohortPage {
  items: Cohort[];
  nextCursor: string | null;
}

function distributionFor(values: unknown[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const v of values) {
    if (Array.isArray(v)) {
      for (const item of v) {
        const k = String(item);
        dist[k] = (dist[k] ?? 0) + 1;
      }
    } else {
      const k = v == null ? "null" : String(v);
      dist[k] = (dist[k] ?? 0) + 1;
    }
  }
  return dist;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  // Resolve cohort emails. For the canonical kit we expect criteria.emails:
  // string[]. Real implementations swap in their own membership query.
  const cohortPage = await invokeJson<CohortPage>(context, `/cohorts?limit=200`, {
    headers: auth,
  });
  const cohortA = cohortPage.items.find((c) => c.slug === body.cohortSlugA);
  const cohortB = cohortPage.items.find((c) => c.slug === body.cohortSlugB);
  const emailsA = new Set<string>(
    Array.isArray(cohortA?.criteria?.emails) ? (cohortA!.criteria.emails as string[]) : [],
  );
  const emailsB = new Set<string>(
    Array.isArray(cohortB?.criteria?.emails) ? (cohortB!.criteria.emails as string[]) : [],
  );

  // Pull every response for this survey + the matching answer.
  const responses: Response_[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ResponsePage>(
      context,
      `/surveys/${body.surveyId}/responses?${qs}`,
      { headers: auth },
    );
    responses.push(...page.items);
    cursor = page.nextCursor;
    if (responses.length > 5000) break;
  } while (cursor);

  const valuesA: unknown[] = [];
  const valuesB: unknown[] = [];
  for (const r of responses) {
    if (!r.respondentEmail) continue;
    const inA = emailsA.has(r.respondentEmail);
    const inB = emailsB.has(r.respondentEmail);
    if (!inA && !inB) continue;

    const detail = await invokeJson<ResponseDetail>(context, `/responses/${r.id}`, {
      headers: auth,
    });
    const a = detail.answers.find((x) => x.questionId === body.questionId);
    if (!a) continue;
    if (inA) valuesA.push(a.value);
    if (inB) valuesB.push(a.value);
  }

  return new Response(
    JSON.stringify({
      surveyId: body.surveyId,
      questionId: body.questionId,
      cohortA: {
        slug: body.cohortSlugA,
        responseCount: valuesA.length,
        distribution: distributionFor(valuesA),
      },
      cohortB: {
        slug: body.cohortSlugB,
        responseCount: valuesB.length,
        distribution: distributionFor(valuesB),
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
}
