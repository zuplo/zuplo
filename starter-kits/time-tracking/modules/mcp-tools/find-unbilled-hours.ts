import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { TimeEntry } from "../repositories/time-entries.ts";

/**
 * Orchestrator MCP tool: find_unbilled_hours.
 *
 * Lists all draft (status=draft, billable=true) time entries — i.e. work
 * that's tracked but not yet on a submitted timesheet — grouped by project.
 * Optionally narrowed to a single project.
 */

interface Body {
  projectId?: string;
}

interface TimeEntryPage {
  items: TimeEntry[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = request.headers.get("authorization") ?? "";

  const entries: TimeEntry[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      status: "draft",
      billable: "true",
    });
    if (body.projectId) qs.set("projectId", body.projectId);
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<TimeEntryPage>(
      context,
      `/time-entries?${qs}`,
      { headers: { authorization: auth } },
    );
    entries.push(...page.items);
    cursor = page.nextCursor;
    if (entries.length > 5000) break;
  } while (cursor);

  // entries are guaranteed billable=true and status=draft (and not yet on a
  // timesheet — draft entries are by definition unattached). Group by project.
  const byProject: Record<
    string,
    { projectId: string; entryCount: number; totalMinutes: number; totalHours: number }
  > = {};
  for (const e of entries) {
    if (e.timesheetId) continue; // belt-and-suspenders: skip entries already on a timesheet
    const bucket =
      byProject[e.projectId] ??
      (byProject[e.projectId] = {
        projectId: e.projectId,
        entryCount: 0,
        totalMinutes: 0,
        totalHours: 0,
      });
    bucket.entryCount += 1;
    bucket.totalMinutes += e.durationMinutes;
    bucket.totalHours = Math.round((bucket.totalMinutes / 60) * 100) / 100;
  }

  const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);

  return new Response(
    JSON.stringify({
      filter: { projectId: body.projectId ?? null },
      totalEntries: entries.length,
      totalMinutes,
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
      byProject: Object.values(byProject),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
