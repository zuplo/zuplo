import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import { requireTenant } from "../_shared/auth/index.ts";
import { hireRepository } from "../repositories/hires.ts";
import type { OnboardingTask } from "../repositories/onboarding-tasks.ts";

/**
 * Orchestrator MCP tool: notify_buddy.
 *
 * Reads the hire + their first-week buddy-category tasks and returns a draft
 * notification payload (subject + body) keyed to the buddy. Does NOT send
 * email — that's left to the integrator. Returns a structured payload an
 * agent can review and send via its own tool of choice.
 */

interface Body {
  hireId: string;
}

interface TaskPage {
  items: OnboardingTask[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.hireId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "hireId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const hire = await hireRepository.get(tenantId, body.hireId);
  if (!hire) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Hire not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  if (!hire.buddyEmail) {
    return new Response(
      JSON.stringify({ error: { type: "no_buddy", message: "No buddy assigned to this hire" } }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }

  // Pull all tasks for this hire and pick the buddy-category ones with a
  // dueDate inside the first week.
  const allTasks: OnboardingTask[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      hireId: body.hireId,
      category: "buddy",
    });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<TaskPage>(
      context,
      `/tasks?${qs}`,
      { headers: { authorization: auth } },
    );
    allTasks.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  const start = new Date(`${hire.startDate}T00:00:00Z`);
  const weekEnd = new Date(start);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekEndIso = weekEnd.toISOString().slice(0, 10);
  const firstWeekTasks = allTasks.filter(
    (t) => t.dueDate >= hire.startDate && t.dueDate <= weekEndIso,
  );

  const subject = `Buddy check-in: welcoming ${hire.firstName} ${hire.lastName}`;
  const lines = [
    `Hi,`,
    ``,
    `${hire.firstName} ${hire.lastName} starts on ${hire.startDate} as ${hire.role}. You've been paired as their buddy.`,
    ``,
    `Here is the buddy checklist for their first week:`,
    ...firstWeekTasks.map(
      (t) => `  - [${t.dueDate}] ${t.title} — ${t.description}`,
    ),
    ``,
    `Let HR know if anything looks off. Thanks!`,
  ];

  return new Response(
    JSON.stringify({
      to: hire.buddyEmail,
      subject,
      body: lines.join("\n"),
      hire: {
        id: hire.id,
        firstName: hire.firstName,
        lastName: hire.lastName,
        startDate: hire.startDate,
        role: hire.role,
      },
      taskCount: firstWeekTasks.length,
      tasks: firstWeekTasks,
      note: "This tool returns a draft. Sending the email is left to the integrator.",
    }),
    { headers: { "content-type": "application/json" } },
  );
}
