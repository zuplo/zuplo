import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import type { TimeEntry } from "../repositories/time-entries.ts";
import { timesheetRepository } from "../repositories/timesheets.ts";

/**
 * Orchestrator MCP tool: submit_weekly_timesheet.
 *
 * For an employee + week-start date:
 *   1. Calls list_time_entries (via context.invokeRoute) to fetch the week's entries.
 *   2. Sums total minutes.
 *   3. Creates a Timesheet row in 'submitted' status.
 *
 * The orchestrator goes through the public list endpoint so multi-tenancy and
 * rate limits stay enforced.
 */

interface Body {
  employeeId: string;
  weekStartDate: string; // YYYY-MM-DD, the Monday of the week
}

interface TimeEntryPage {
  items: TimeEntry[];
  nextCursor: string | null;
}

function endOfWeek(weekStartDate: string): string {
  const d = new Date(`${weekStartDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString();
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.employeeId || !body.weekStartDate) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "employeeId and weekStartDate are required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const startTimeFrom = `${body.weekStartDate}T00:00:00Z`;
  const startTimeTo = endOfWeek(body.weekStartDate);

  const entries: TimeEntry[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      employeeId: body.employeeId,
      startTimeFrom,
      startTimeTo,
    });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<TimeEntryPage>(
      context,
      `/time-entries?${qs}`,
      { headers: { authorization: auth } },
    );
    entries.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);

  const timesheet = await timesheetRepository.create(tenantId, {
    employeeId: body.employeeId,
    weekStartDate: body.weekStartDate,
    status: "submitted",
    totalMinutes,
    submittedAt: new Date().toISOString(),
    approvedAt: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({
      timesheet,
      entryCount: entries.length,
      totalMinutes,
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
