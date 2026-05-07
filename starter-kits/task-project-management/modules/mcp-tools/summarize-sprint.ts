import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Task } from "../repositories/tasks.ts";

/**
 * Orchestrator: summarize_sprint.
 *
 * Given a project and a date window, returns:
 *   - tasks completed in the window (status=done with completedAt in range)
 *   - tasks still open whose dueDate falls in the window
 *   - blockers (status=blocked) on the project
 *
 * The grouping is what an LLM needs to write a sprint review summary or a
 * standup. The window is inclusive on both ends, ISO date strings.
 */

interface Body {
  projectId: string;
  fromDate: string;
  toDate: string;
}

interface TaskPage {
  items: Task[];
  nextCursor: string | null;
}

function inWindow(at: string | null, fromMs: number, toMs: number) {
  if (!at) return false;
  const t = Date.parse(at);
  return !Number.isNaN(t) && t >= fromMs && t <= toMs;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.projectId || !body.fromDate || !body.toDate) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "projectId, fromDate, and toDate are required",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const fromMs = Date.parse(body.fromDate);
  const toMs = Date.parse(body.toDate);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "fromDate and toDate must be ISO date strings",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const all: Task[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      projectId: body.projectId,
    });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<TaskPage>(context, `/tasks?${qs}`, {
      headers: auth,
    });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 5000) break;
  } while (cursor);

  // Filter to this project (defensive — list-tasks already filters but the
  // caller could supply a different projectId).
  const projectTasks = all.filter((t) => t.projectId === body.projectId);

  const completedInWindow = projectTasks.filter(
    (t) => t.status === "done" && inWindow(t.completedAt, fromMs, toMs),
  );
  const openDueInWindow = projectTasks.filter(
    (t) =>
      t.status !== "done" &&
      t.status !== "blocked" &&
      inWindow(t.dueDate, fromMs, toMs),
  );
  const blockers = projectTasks.filter((t) => t.status === "blocked");

  return new Response(
    JSON.stringify({
      projectId: body.projectId,
      fromDate: body.fromDate,
      toDate: body.toDate,
      counts: {
        completed: completedInWindow.length,
        openDueInWindow: openDueInWindow.length,
        blockers: blockers.length,
      },
      completed: completedInWindow,
      openDueInWindow,
      blockers,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
