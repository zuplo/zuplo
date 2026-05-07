import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { OnboardingTask } from "../repositories/onboarding-tasks.ts";

/**
 * Orchestrator MCP tool: check_overdue_tasks.
 *
 * Lists tasks whose dueDate < today and status != done, optionally narrowed
 * to a single hire. Groups by ownerEmail so the LLM can surface "who has
 * overdue work" without you reading every row.
 */

interface Body {
  hireId?: string;
}

interface TaskPage {
  items: OnboardingTask[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const todayIso = new Date().toISOString().slice(0, 10);

  const tasks: OnboardingTask[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (body.hireId) qs.set("hireId", body.hireId);
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<TaskPage>(
      context,
      `/tasks?${qs}`,
      { headers: { authorization: auth } },
    );
    tasks.push(...page.items);
    cursor = page.nextCursor;
    if (tasks.length > 5000) break;
  } while (cursor);

  const overdue = tasks.filter((t) => t.status !== "done" && t.dueDate < todayIso);

  const byOwner: Record<string, OnboardingTask[]> = {};
  for (const t of overdue) {
    (byOwner[t.ownerEmail] ??= []).push(t);
  }

  return new Response(
    JSON.stringify({
      asOf: todayIso,
      filter: { hireId: body.hireId ?? null },
      overdueCount: overdue.length,
      byOwner: Object.entries(byOwner).map(([owner, list]) => ({
        ownerEmail: owner,
        count: list.length,
        tasks: list.map((t) => ({
          id: t.id,
          hireId: t.hireId,
          title: t.title,
          dueDate: t.dueDate,
          status: t.status,
          category: t.category,
        })),
      })),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
