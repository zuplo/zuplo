import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Application } from "../repositories/applications.ts";

/**
 * Orchestrator MCP tool: pipeline_health_for_job.
 *
 * For a single job: counts applications per stage and computes the average
 * time-in-stage in days. Useful for funnel analysis and surfacing stalled
 * candidates ("everyone's been in 'phone_screen' for 14+ days").
 */

interface Body {
  jobId: string;
}

interface ApplicationPage {
  items: Application[];
  nextCursor: string | null;
}

const STAGES: Application["stage"][] = [
  "applied",
  "phone_screen",
  "onsite",
  "offer",
  "hired",
  "rejected",
];

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.jobId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "jobId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";

  const applications: Application[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", jobId: body.jobId });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ApplicationPage>(
      context,
      `/applications?${qs}`,
      { headers: { authorization: auth } },
    );
    applications.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  const now = Date.now();
  const stages: Record<
    string,
    { count: number; avgDaysInStage: number; sumDays: number }
  > = {};
  for (const stage of STAGES) {
    stages[stage] = { count: 0, avgDaysInStage: 0, sumDays: 0 };
  }

  for (const app of applications) {
    const bucket = stages[app.stage];
    if (!bucket) continue;
    bucket.count += 1;
    const days = (now - Date.parse(app.stageEnteredAt)) / 86_400_000;
    bucket.sumDays += days;
  }
  for (const stage of STAGES) {
    const b = stages[stage];
    b.avgDaysInStage = b.count > 0 ? Math.round((b.sumDays / b.count) * 10) / 10 : 0;
  }

  return new Response(
    JSON.stringify({
      jobId: body.jobId,
      totalApplications: applications.length,
      stages: STAGES.map((s) => ({
        stage: s,
        count: stages[s].count,
        avgDaysInStage: stages[s].avgDaysInStage,
      })),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
