import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";

/**
 * Orchestrator: find_drop_off_step.
 *
 * Calls compute_funnel internally over the last `daysBack` days and reports
 * the step with the worst step-to-step conversion (i.e. the biggest drop-off).
 */

interface Body {
  funnelSlug: string;
  daysBack?: number;
}

interface FunnelResult {
  funnelSlug: string;
  dateFrom: string | null;
  dateTo: string | null;
  usersConsidered: number;
  steps: Array<{
    stepIndex: number;
    eventName: string;
    count: number;
    conversionFromPrev: number;
  }>;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.funnelSlug) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "funnelSlug is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const daysBack = Math.max(1, Math.min(365, body.daysBack ?? 7));
  const dateFrom = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const dateTo = new Date().toISOString();

  const auth = { authorization: request.headers.get("authorization") ?? "" };
  const result = await invokeJson<FunnelResult>(context, "/compute-funnel", {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ funnelSlug: body.funnelSlug, dateFrom, dateTo }),
  });

  // Skip step 0; it has no previous step to drop off from.
  const candidates = result.steps.slice(1);
  let worst: (typeof candidates)[number] | null = null;
  let worstDropoff = -1;
  for (const step of candidates) {
    const dropoff = 1 - step.conversionFromPrev;
    if (dropoff > worstDropoff) {
      worstDropoff = dropoff;
      worst = step;
    }
  }

  return new Response(
    JSON.stringify({
      funnelSlug: body.funnelSlug,
      daysBack,
      dateFrom,
      dateTo,
      stepsAnalyzed: candidates.length,
      worstStep: worst,
      dropoffPct: worstDropoff >= 0 ? Math.round(worstDropoff * 1000) / 10 : null,
      allSteps: result.steps,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
