import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Review } from "../repositories/reviews.ts";

/**
 * Orchestrator MCP tool: summarize_feedback_themes.
 *
 * For a reviewee + cycle, lists all submitted reviews and produces a themed
 * summary structure: per-kind counts, per-competency average ratings, and a
 * concatenation of the narratives keyed by reviewer kind. The LLM uses this
 * to write the calibration write-up.
 */

interface Body {
  revieweeEmail: string;
  cycleId: string;
}

interface ReviewPage {
  items: Review[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.revieweeEmail || !body.cycleId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "revieweeEmail and cycleId are required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";

  const reviews: Review[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      revieweeEmail: body.revieweeEmail,
      cycleId: body.cycleId,
      status: "submitted",
    });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ReviewPage>(
      context,
      `/reviews?${qs}`,
      { headers: { authorization: auth } },
    );
    reviews.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  const byKind: Record<string, number> = {};
  const ratingsTotals: Record<string, { sum: number; n: number }> = {};
  const narrativesByKind: Record<string, string[]> = {};

  for (const r of reviews) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    for (const [comp, val] of Object.entries(r.ratings)) {
      const t = (ratingsTotals[comp] ??= { sum: 0, n: 0 });
      t.sum += val;
      t.n += 1;
    }
    if (r.narrative) {
      (narrativesByKind[r.kind] ??= []).push(r.narrative);
    }
  }

  const avgRatings: Record<string, number> = {};
  for (const [k, v] of Object.entries(ratingsTotals)) {
    avgRatings[k] = Math.round((v.sum / v.n) * 100) / 100;
  }

  return new Response(
    JSON.stringify({
      revieweeEmail: body.revieweeEmail,
      cycleId: body.cycleId,
      reviewCount: reviews.length,
      byKind,
      avgRatingsByCompetency: avgRatings,
      narrativesByKind,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
