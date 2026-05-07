import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Response_ } from "../repositories/responses.ts";

interface Body {
  surveyId: string;
  segmentA: string;
  segmentB: string;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

interface CohortStats {
  segment: string;
  count: number;
  promoters: number;
  passives: number;
  detractors: number;
  npsScore: number;
}

/**
 * Orchestrator: compare_cohorts.
 *
 * Computes NPS per segment and returns the delta. NPS = % promoters - %
 * detractors, on a -100..100 scale. Useful for "is enterprise happier
 * than SMB?" rollups.
 */
function computeCohort(segment: string, responses: Response_[]): CohortStats {
  const filtered = responses.filter((r) => r.segment === segment);
  const promoters = filtered.filter((r) => r.category === "promoter").length;
  const passives = filtered.filter((r) => r.category === "passive").length;
  const detractors = filtered.filter((r) => r.category === "detractor").length;
  const count = filtered.length;
  const npsScore =
    count === 0 ? 0 : Math.round(((promoters - detractors) / count) * 100);
  return { segment, count, promoters, passives, detractors, npsScore };
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";

  const all: Response_[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", surveyId: body.surveyId });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<Page<Response_>>(context, `/responses?${qs}`, {
      headers: { authorization: auth },
    });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 5000) break;
  } while (cursor);

  const a = computeCohort(body.segmentA, all);
  const b = computeCohort(body.segmentB, all);

  return new Response(
    JSON.stringify({
      surveyId: body.surveyId,
      cohortA: a,
      cohortB: b,
      delta: a.npsScore - b.npsScore,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
