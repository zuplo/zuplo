import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import type { Hire } from "../repositories/hires.ts";
import type {
  OnboardingTemplate,
} from "../repositories/onboarding-templates.ts";
import {
  onboardingTaskRepository,
  type OnboardingTask,
} from "../repositories/onboarding-tasks.ts";
import { hireRepository } from "../repositories/hires.ts";
import { onboardingTemplateRepository } from "../repositories/onboarding-templates.ts";
import { completeWithClaude } from "../integrations/claude.ts";

/**
 * Orchestrator MCP tool: create_onboarding_plan.
 *
 * Reads the OnboardingTemplate, then for each TaskTemplate creates a real
 * OnboardingTask attached to the hire, scheduling dueDate as
 * `hire.startDate + daysFromStart`. Resolves dependsOnTitles into the freshly
 * created task ids.
 *
 * When `generate306090: true`, also asks Claude to draft a 30/60/90 day plan
 * from the hire's role + level — perfect to drop into the new hire's first
 * 1:1 doc.
 */

interface Body {
  hireId: string;
  templateId: string;
  /** When true, ask Claude to draft a personalized 30/60/90 plan from the hire's role + level. */
  generate306090?: boolean;
  /** Optional level for the 30/60/90 plan — IC2, IC3, M1, etc. Improves Claude's calibration. */
  level?: string;
  /** Optional team name / company context for the 30/60/90 plan. */
  teamContext?: string;
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

  // Optional: Claude-drafted 30/60/90 plan tailored to this role.
  let plan306090:
    | { text: string; model: string; inputTokens: number; outputTokens: number }
    | undefined;
  if (body.generate306090) {
    try {
      const completion = await completeWithClaude({
        system:
          "You are an experienced engineering / operations manager writing a 30/60/90 day plan for a new hire. Output exactly three sections: '## First 30 days', '## Days 31-60', '## Days 61-90'. Each section has 4-6 bulleted goals, mixing learning, output, and relationship-building. Keep tone warm and concrete — reference real activities, not platitudes. End with a one-line note on how to revisit the plan in their first 1:1.",
        messages: [
          {
            role: "user",
            content:
              `Hire: ${hire.firstName} ${hire.lastName}\n` +
              `Role: ${hire.role}\n` +
              `Level: ${body.level ?? "(not specified)"}\n` +
              `Start date: ${hire.startDate}\n` +
              `Manager: ${hire.managerEmail}\n` +
              `Team / company context: ${body.teamContext ?? "(not specified)"}\n\n` +
              `Write the plan.`,
          },
        ],
        temperature: 0.5,
        maxTokens: 1500,
      });
      plan306090 = {
        text: completion.text,
        model: completion.model,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
      };
    } catch (err) {
      plan306090 = {
        text: `(Claude 30/60/90 plan unavailable: ${(err as Error).message})`,
        model: "",
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  }

  return new Response(
    JSON.stringify({
      hireId: hire.id,
      templateId: template.id,
      tasksCreated: created.length,
      tasks: created,
      plan306090,
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
