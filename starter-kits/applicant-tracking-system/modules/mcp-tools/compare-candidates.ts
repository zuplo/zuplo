import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Application } from "../repositories/applications.ts";
import { scorecardRepository } from "../repositories/scorecards.ts";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";

/**
 * Orchestrator MCP tool: compare_candidates.
 *
 * Given a list of application ids (typically all on the same job), aggregates
 * each application's scorecards and returns a side-by-side comparison: average
 * rating per competency, distribution of recommendations, count of scorecards.
 * The LLM uses this to draft a debrief comparison.
 */

interface Body {
  applicationIds: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!Array.isArray(body.applicationIds) || body.applicationIds.length === 0) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "applicationIds is required and must be non-empty" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";

  const applications: Application[] = [];
  for (const id of body.applicationIds) {
    const app = await invokeJson<Application>(
      context,
      `/applications/${id}`,
      { headers: { authorization: auth } },
    ).catch(() => null);
    if (app) applications.push(app);
  }

  // Scorecards: read directly (no public list endpoint).
  const all = await scorecardRepository.list(tenantId, { limit: 500 });

  const rows = applications.map((app) => {
    const scorecards = all.items.filter((s) => s.applicationId === app.id);
    const recCounts: Record<string, number> = {};
    const ratingsTotals: Record<string, { sum: number; n: number }> = {};
    for (const s of scorecards) {
      recCounts[s.recommendation] = (recCounts[s.recommendation] ?? 0) + 1;
      for (const [competency, value] of Object.entries(s.ratings)) {
        const t = (ratingsTotals[competency] ??= { sum: 0, n: 0 });
        t.sum += value;
        t.n += 1;
      }
    }
    const avgRatings: Record<string, number> = {};
    for (const [k, v] of Object.entries(ratingsTotals)) {
      avgRatings[k] = Math.round((v.sum / v.n) * 100) / 100;
    }
    return {
      applicationId: app.id,
      candidateId: app.candidateId,
      jobId: app.jobId,
      stage: app.stage,
      score: app.score,
      scorecardCount: scorecards.length,
      recommendationCounts: recCounts,
      avgRatingsByCompetency: avgRatings,
    };
  });

  return new Response(JSON.stringify({ comparisons: rows }), {
    headers: { "content-type": "application/json" },
  });
}
