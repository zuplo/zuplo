import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Enrollment } from "../repositories/enrollments.ts";
import { cadenceTaskRepository, type CadenceTask } from "../repositories/cadence-tasks.ts";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";

interface Body {
  repEmail: string;
}

interface EnrollmentPage {
  items: Enrollment[];
  nextCursor: string | null;
}

/**
 * Orchestrator: daily_task_brief.
 *
 * Builds the rep's daily call-and-task brief. Reads pending CadenceTasks
 * via the repository directly (CadenceTasks are an internal entity that
 * does not have its own public list route) and pairs them with their
 * parent enrollments, so the rep gets a list of "who, why, when".
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";

  // Pull tasks directly from the repository. Filter to this rep by joining
  // with enrollment ownership.
  const enrollmentsByRep = new Map<string, Enrollment>();
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<EnrollmentPage>(context, `/enrollments?${qs}`, {
      headers: { authorization: auth },
    });
    for (const e of page.items) {
      if (e.repEmail.toLowerCase() === body.repEmail.toLowerCase()) {
        enrollmentsByRep.set(e.id, e);
      }
    }
    cursor = page.nextCursor;
  } while (cursor);

  // Walk pending tasks. For very large tenants you'd add a /cadence-tasks
  // route with filters; for the starter kit we walk the repo.
  const tasks: CadenceTask[] = [];
  let taskCursor: string | null | undefined;
  do {
    const taskPage = await cadenceTaskRepository.list(tenantId, {
      limit: 200,
      cursor: taskCursor,
    });
    for (const t of taskPage.items) {
      if (t.status !== "pending") continue;
      if (!enrollmentsByRep.has(t.enrollmentId)) continue;
      tasks.push(t);
    }
    taskCursor = taskPage.nextCursor;
    if (tasks.length > 500) break;
  } while (taskCursor);

  // Sort overdue first, then by dueAt asc.
  const now = Date.now();
  const ordered = tasks.sort((a, b) => {
    const aOver = new Date(a.dueAt).getTime() < now ? 0 : 1;
    const bOver = new Date(b.dueAt).getTime() < now ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    return a.dueAt.localeCompare(b.dueAt);
  });

  return new Response(
    JSON.stringify({
      repEmail: body.repEmail,
      total: ordered.length,
      tasks: ordered.map((t) => ({
        id: t.id,
        enrollmentId: t.enrollmentId,
        stepIndex: t.stepIndex,
        kind: t.kind,
        dueAt: t.dueAt,
        overdue: new Date(t.dueAt).getTime() < now,
      })),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
