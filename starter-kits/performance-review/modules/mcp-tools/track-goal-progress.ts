import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Goal } from "../repositories/goals.ts";

/**
 * Orchestrator MCP tool: track_goal_progress.
 *
 * Lists all goals for an employee and computes:
 *   - count by status
 *   - average progress %
 *   - "on track" percentage
 *   - count of at-risk goals
 *   - count of overdue goals (dueDate < today and not completed)
 */

interface Body {
  employeeEmail: string;
}

interface GoalPage {
  items: Goal[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.employeeEmail) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "employeeEmail is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const todayIso = new Date().toISOString().slice(0, 10);

  const goals: Goal[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", employeeEmail: body.employeeEmail });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<GoalPage>(
      context,
      `/goals?${qs}`,
      { headers: { authorization: auth } },
    );
    goals.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  const byStatus: Record<string, number> = { on_track: 0, at_risk: 0, completed: 0 };
  let progressSum = 0;
  let overdue = 0;
  for (const g of goals) {
    byStatus[g.status] = (byStatus[g.status] ?? 0) + 1;
    progressSum += g.progress;
    if (g.dueDate < todayIso && g.status !== "completed") overdue += 1;
  }
  const total = goals.length;
  const avgProgress = total > 0 ? Math.round((progressSum / total) * 10) / 10 : 0;
  const onTrackPct = total > 0 ? Math.round(((byStatus.on_track ?? 0) / total) * 1000) / 10 : 0;

  return new Response(
    JSON.stringify({
      employeeEmail: body.employeeEmail,
      asOf: todayIso,
      totalGoals: total,
      countByStatus: byStatus,
      avgProgress,
      onTrackPct,
      atRiskCount: byStatus.at_risk ?? 0,
      overdueCount: overdue,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
