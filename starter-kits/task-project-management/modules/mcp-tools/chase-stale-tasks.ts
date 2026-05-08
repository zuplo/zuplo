import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Task } from "../repositories/tasks.ts";
import { sendSlackMessage } from "../integrations/slack.ts";

/**
 * Orchestrator: chase_stale_tasks.
 *
 * Returns tasks where status is "doing" or "blocked" and `updatedAt` is older
 * than `daysWithoutActivity` days ago. Optionally narrowed by assignee.
 *
 * Each row carries a draft nudge message. When `dispatch=true` the tool also
 * posts the nudges to Slack (one message per assignee, grouped) so a downstream
 * agent can run this on demand instead of just inspecting the drafts.
 */

interface Body {
  assigneeEmail?: string;
  daysWithoutActivity?: number;
  /** When true, post the grouped nudges to Slack (uses SLACK_WEBHOOK_URL or bot token + SLACK_DEFAULT_CHANNEL). */
  dispatch?: boolean;
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

  let dispatched = 0;
  const dispatchErrors: string[] = [];
  if (body.dispatch && result.length > 0) {
    for (const [assignee, rows] of Object.entries(byAssignee)) {
      const lines = rows.map(
        (r) =>
          `• _${r.task.title}_ (\`${r.task.status}\`, ${r.ageDays}d cold) — task \`${r.task.id}\``,
      );
      const text = `:bell: *Stale task nudge for ${assignee}* (${rows.length} task${rows.length === 1 ? "" : "s"} > ${days}d without activity)\n${lines.join("\n")}`;
      try {
        await sendSlackMessage({ text });
        dispatched += 1;
      } catch (err) {
        dispatchErrors.push(`${assignee}: ${(err as Error).message}`);
      }
    }
  }

  return new Response(
    JSON.stringify({
      daysWithoutActivity: days,
      count: result.length,
      tasks: result,
      byAssignee,
      dispatched,
      dispatchErrors,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
