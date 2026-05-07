import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Task } from "../repositories/tasks.ts";

/**
 * Orchestrator: chase_stale_tasks.
 *
 * Returns tasks where status is "doing" or "blocked" and `updatedAt` is older
 * than `daysWithoutActivity` days ago. Optionally narrowed by assignee.
 *
 * Each row carries a draft nudge message the LLM can rewrite, so a downstream
 * agent can send the reminder.
 */

interface Body {
  assigneeEmail?: string;
  daysWithoutActivity?: number;
}

interface TaskPage {
  items: Task[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const days = Math.max(1, Math.min(365, body.daysWithoutActivity ?? 7));
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const all: Task[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    if (body.assigneeEmail) qs.set("assigneeEmail", body.assigneeEmail);
    const page = await invokeJson<TaskPage>(context, `/tasks?${qs}`, {
      headers: auth,
    });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 5000) break;
  } while (cursor);

  const stale = all.filter((t) => {
    if (t.status !== "doing" && t.status !== "blocked") return false;
    if (body.assigneeEmail && t.assigneeEmail !== body.assigneeEmail)
      return false;
    const ts = Date.parse(t.updatedAt);
    return !Number.isNaN(ts) && ts < cutoff;
  });

  const now = Date.now();
  const result = stale.map((t) => {
    const ageMs = now - Date.parse(t.updatedAt);
    const ageDays = Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
    const draftMessage = t.assigneeEmail
      ? `Hi ${t.assigneeEmail.split("@")[0]} — task "${t.title}" is ${t.status} and hasn't been updated in ${ageDays} day${ageDays === 1 ? "" : "s"}. Any update?`
      : `Task "${t.title}" is ${t.status} and unassigned, last touched ${ageDays} day${ageDays === 1 ? "" : "s"} ago. Needs an owner.`;
    return {
      task: t,
      ageDays,
      draftMessage,
    };
  });

  // Group by assignee for easier nudging.
  const byAssignee: Record<string, typeof result> = {};
  for (const row of result) {
    const key = row.task.assigneeEmail ?? "unassigned";
    (byAssignee[key] ??= []).push(row);
  }

  return new Response(
    JSON.stringify({
      daysWithoutActivity: days,
      count: result.length,
      tasks: result,
      byAssignee,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
