import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Application } from "../repositories/applications.ts";
import { candidateRepository } from "../repositories/candidates.ts";
import { scorecardRepository } from "../repositories/scorecards.ts";
import { requireTenant } from "../_shared/auth/index.ts";

/**
 * Orchestrator MCP tool: summarize_candidate.
 *
 * Pulls the candidate record + every Application they have + every Scorecard
 * across those applications and returns a chronological summary, ready for
 * the LLM to draft an interview prep packet or a hiring decision write-up.
 *
 * Applications are fetched through the public list_applications route
 * (context.invokeRoute keeps tenant + auth scoping); the Candidate and
 * Scorecards have no get/list routes, so we read directly from the
 * repositories with the verified tenantId.
 */

interface Body {
  candidateId: string;
}

interface ApplicationPage {
  items: Application[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.candidateId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "candidateId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";

  const candidate = await candidateRepository.get(tenantId, body.candidateId);

  // Pull all applications for this candidate.
  const applications: Application[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", candidateId: body.candidateId });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ApplicationPage>(
      context,
      `/applications?${qs}`,
      { headers: { authorization: auth } },
    );
    applications.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  // Pull all scorecards across those applications. Scorecards has no public
  // list endpoint in this kit so we read directly from the repository.
  const allScorecards = await scorecardRepository.list(tenantId, { limit: 200 });
  const appIds = new Set(applications.map((a) => a.id));
  const scorecards = allScorecards.items.filter((s) => appIds.has(s.applicationId));

  const timeline = applications
    .map((a) => ({
      applicationId: a.id,
      jobId: a.jobId,
      stage: a.stage,
      stageEnteredAt: a.stageEnteredAt,
      createdAt: a.createdAt,
      source: a.source,
      score: a.score,
      scorecards: scorecards
        .filter((s) => s.applicationId === a.id)
        .map((s) => ({
          interviewerEmail: s.interviewerEmail,
          recommendation: s.recommendation,
          ratings: s.ratings,
          notes: s.notes,
        })),
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return new Response(
    JSON.stringify({
      candidate,
      applicationCount: applications.length,
      scorecardCount: scorecards.length,
      timeline,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
