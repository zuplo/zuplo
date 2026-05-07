import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Task } from "../repositories/tasks.ts";

/**
 * Orchestrator: rebalance_workload.
 *
 * For a project, computes per-assignee task count + total estimated effort
 * (based on `estimateHours`, which falls back to a priority-based default).
 * Suggests reassignments where one assignee is carrying more than 2x the
 * effort of another. The LLM uses this to draft a swap proposal.
 */

interface Body {
  projectId: string;
}

interface TaskPage {
  items: Task[];
  nextCursor: string | null;
}

const PRIORITY_DEFAULT_HOURS: Record<Task["priority"], number> = {
  low: 1,
  med: 4,
  high: 8,
  urgent: 16,
};

interface AssigneeLoad {
  assigneeEmail: string;
  taskCount: number;
  totalHours: number;
  tasks: Task[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.projectId) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "projectId is required" },
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

  // Only weigh open work — completed tasks are sunk effort, not load.
  const open = all.filter(
    (t) => t.projectId === body.projectId && t.status !== "done",
  );

  const byAssignee = new Map<string, AssigneeLoad>();
  for (const t of open) {
    const key = t.assigneeEmail ?? "unassigned";
    const load =
      byAssignee.get(key) ??
      ({
        assigneeEmail: key,
        taskCount: 0,
        totalHours: 0,
        tasks: [],
      } satisfies AssigneeLoad);
    const hours = t.estimateHours ?? PRIORITY_DEFAULT_HOURS[t.priority] ?? 4;
    load.taskCount += 1;
    load.totalHours += hours;
    load.tasks.push(t);
    byAssignee.set(key, load);
  }

  const loads = [...byAssignee.values()].sort(
    (a, b) => b.totalHours - a.totalHours,
  );
  const realLoads = loads.filter((l) => l.assigneeEmail !== "unassigned");

  // Suggest reassignments for any pair where heaviest > 2x lightest among
  // real assignees (ignore "unassigned" — those need pickup, not balancing).
  const suggestions: Array<{
    fromEmail: string;
    toEmail: string;
    candidateTasks: Array<{ id: string; title: string; estimatedHours: number }>;
    fromHours: number;
    toHours: number;
  }> = [];

  if (realLoads.length >= 2) {
    const heaviest = realLoads[0];
    const lightest = realLoads[realLoads.length - 1];
    if (heaviest.totalHours > 2 * Math.max(1, lightest.totalHours)) {
      // Pick up to 3 lower-priority candidate tasks to move.
      const candidates = [...heaviest.tasks]
        .sort((a, b) => {
          const order = { urgent: 0, high: 1, med: 2, low: 3 } as const;
          return order[a.priority] - order[b.priority];
        })
        .reverse()
        .slice(0, 3)
        .map((t) => ({
          id: t.id,
          title: t.title,
          estimatedHours:
            t.estimateHours ?? PRIORITY_DEFAULT_HOURS[t.priority] ?? 4,
        }));
      suggestions.push({
        fromEmail: heaviest.assigneeEmail,
        toEmail: lightest.assigneeEmail,
        candidateTasks: candidates,
        fromHours: heaviest.totalHours,
        toHours: lightest.totalHours,
      });
    }
  }

  return new Response(
    JSON.stringify({
      projectId: body.projectId,
      loads: loads.map((l) => ({
        assigneeEmail: l.assigneeEmail,
        taskCount: l.taskCount,
        totalHours: l.totalHours,
      })),
      suggestions,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
