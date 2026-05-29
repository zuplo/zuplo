import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import type { Hire } from "../repositories/hires.ts";
import type {
  OnboardingTemplate,
  TaskTemplate,
} from "../repositories/onboarding-templates.ts";
import {
  onboardingTaskRepository,
  type OnboardingTask,
} from "../repositories/onboarding-tasks.ts";
import { hireRepository } from "../repositories/hires.ts";
import { onboardingTemplateRepository } from "../repositories/onboarding-templates.ts";

/**
 * Orchestrator MCP tool: create_onboarding_plan.
 *
 * Reads the OnboardingTemplate, then for each TaskTemplate creates a real
 * OnboardingTask attached to the hire, scheduling dueDate as
 * `hire.startDate + daysFromStart`. Resolves dependsOnTitles into the freshly
 * created task ids.
 *
 * The Hire and Template are read directly from their repositories (no public
 * read endpoints in this kit); creates go through the public `/tasks`
 * endpoint via context.invokeRoute so the same validation + tenant scoping
 * runs for every task.
 */

interface Body {
  hireId: string;
  templateId: string;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.hireId || !body.templateId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "hireId and templateId are required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";

  const hire: Hire | null = await hireRepository.get(tenantId, body.hireId);
  if (!hire) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Hire not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  const template: OnboardingTemplate | null = await onboardingTemplateRepository.get(
    tenantId,
    body.templateId,
  );
  if (!template) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Template not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  // Pass 1: create one task per template entry, recording the new id under the
  // template's title so dependency arrays can be resolved in pass 2.
  const idByTitle = new Map<string, string>();
  const created: OnboardingTask[] = [];
  for (const t of template.tasks) {
    const dueDate = addDays(hire.startDate, t.daysFromStart);
    const task = await invokeJson<OnboardingTask>(
      context,
      `/tasks`,
      {
        method: "POST",
        headers: {
          authorization: auth,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          hireId: hire.id,
          title: t.title,
          description: t.description,
          ownerEmail: t.ownerEmail,
          dueDate,
          category: t.category,
          dependsOn: [],
          status: "open",
        }),
      },
    );
    idByTitle.set(t.title, task.id);
    created.push(task);
  }

  // Pass 2: backfill dependsOn now that we know all the new ids.
  for (let i = 0; i < template.tasks.length; i++) {
    const t = template.tasks[i];
    if (!t.dependsOnTitles || t.dependsOnTitles.length === 0) continue;
    const ids = t.dependsOnTitles
      .map((title) => idByTitle.get(title))
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) continue;
    const taskId = created[i].id;
    await onboardingTaskRepository.update(tenantId, taskId, { dependsOn: ids });
    created[i] = { ...created[i], dependsOn: ids };
  }

  return new Response(
    JSON.stringify({
      hireId: hire.id,
      templateId: template.id,
      tasksCreated: created.length,
      tasks: created,
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
