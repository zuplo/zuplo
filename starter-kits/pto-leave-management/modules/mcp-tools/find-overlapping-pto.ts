import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { LeaveRequest } from "../repositories/leave-requests.ts";

/**
 * Orchestrator MCP tool: find_overlapping_pto.
 *
 * Given a set of team members and a date window, fetch their pending and
 * approved leave requests and return any that overlap with the window.
 * Useful for staffing decisions: "who's out the week of June 10?"
 */

interface Body {
  teamMemberIds: string[];
  startDate: string;
  endDate: string;
}

interface LeaveRequestPage {
  items: LeaveRequest[];
  nextCursor: string | null;
}

function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!Array.isArray(body.teamMemberIds) || body.teamMemberIds.length === 0) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "teamMemberIds is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const conflicts: Array<{
    employeeId: string;
    leaveRequestId: string;
    type: LeaveRequest["type"];
    status: LeaveRequest["status"];
    startDate: string;
    endDate: string;
    days: number;
  }> = [];

  for (const employeeId of body.teamMemberIds) {
    let cursor: string | null | undefined = undefined;
    do {
      const qs = new URLSearchParams({ limit: "200", employeeId });
      if (cursor) qs.set("cursor", cursor);
      const page = await invokeJson<LeaveRequestPage>(
        context,
        `/leave-requests?${qs}`,
        { headers: { authorization: auth } },
      );
      for (const lr of page.items) {
        if (lr.status !== "pending" && lr.status !== "approved") continue;
        if (overlaps(lr.startDate, lr.endDate, body.startDate, body.endDate)) {
          conflicts.push({
            employeeId: lr.employeeId,
            leaveRequestId: lr.id,
            type: lr.type,
            status: lr.status,
            startDate: lr.startDate,
            endDate: lr.endDate,
            days: lr.days,
          });
        }
      }
      cursor = page.nextCursor;
    } while (cursor);
  }

  return new Response(
    JSON.stringify({
      window: { startDate: body.startDate, endDate: body.endDate },
      conflictCount: conflicts.length,
      conflicts,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
