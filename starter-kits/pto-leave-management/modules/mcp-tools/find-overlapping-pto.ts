import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { LeaveRequest } from "../repositories/leave-requests.ts";
import { postSlackMessage } from "../integrations/slack.ts";

/**
 * Orchestrator MCP tool: find_overlapping_pto.
 *
 * Given a set of team members and a date window, fetch their pending and
 * approved leave requests and return any that overlap with the window.
 *
 * If `notifyManager: true` and `managerSlackChannel` is provided (or the
 * SLACK_DEFAULT_CHANNEL env var is set), this tool also posts a Slack
 * message to the manager when conflicts are found — turning "who's out?"
 * into a one-shot proactive coverage alert.
 */

interface Body {
  teamMemberIds: string[];
  startDate: string;
  endDate: string;
  /** When true, push a Slack message to managerSlackChannel if conflicts > 0. */
  notifyManager?: boolean;
  /** Channel id, channel name (#staffing), or user id for a DM. */
  managerSlackChannel?: string;
  /** Optional team name for the alert message. */
  teamName?: string;
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

  // Optional Slack notification: when more people are out than the manager
  // knew about, push a heads-up. Notification failures are surfaced in the
  // response but don't fail the orchestrator (the conflict data is still useful).
  let notification: { sent: boolean; channel?: string; ts?: string; error?: string } | undefined;
  if (body.notifyManager && conflicts.length > 0) {
    try {
      const team = body.teamName ?? "the team";
      const lines = [
        `:warning: *Coverage risk for ${team}* (${body.startDate} to ${body.endDate})`,
        `${conflicts.length} overlapping leave request${conflicts.length === 1 ? "" : "s"}:`,
        ...conflicts.map(
          (c) => `• \`${c.employeeId}\` — ${c.type} (${c.status}) ${c.startDate} to ${c.endDate} (${c.days}d)`,
        ),
      ];
      const result = await postSlackMessage({
        channel: body.managerSlackChannel,
        text: lines.join("\n"),
      });
      notification = { sent: true, channel: result.channel, ts: result.ts };
    } catch (err) {
      notification = { sent: false, error: (err as Error).message };
    }
  }

  return new Response(
    JSON.stringify({
      window: { startDate: body.startDate, endDate: body.endDate },
      conflictCount: conflicts.length,
      conflicts,
      notification,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
