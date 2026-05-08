import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { taskRepository, type Task } from "../repositories/tasks.ts";
import { sendSlackMessage } from "../integrations/slack.ts";
import { createGCalEvent } from "../integrations/google-calendar.ts";

interface Body {
  projectId: string;
  title: string;
  description?: string;
  assigneeEmail?: string | null;
  priority?: Task["priority"];
  status?: Task["status"];
  dueDate?: string | null;
  parentTaskId?: string | null;
  customFields?: Record<string, unknown>;
  labels?: string[];
  estimateHours?: number | null;
  /** When true, suppress side-effects (Slack post, Calendar event). */
  silent?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const now = new Date().toISOString();
  const created = await taskRepository.create(tenantId, {
    projectId: body.projectId,
    title: body.title,
    description: body.description ?? "",
    assigneeEmail: body.assigneeEmail ?? null,
    priority: body.priority ?? "med",
    status: body.status ?? "todo",
    dueDate: body.dueDate ?? null,
    completedAt: null,
    parentTaskId: body.parentTaskId ?? null,
    customFields: body.customFields ?? {},
    labels: body.labels ?? [],
    estimateHours: body.estimateHours ?? null,
    createdAt: now,
    updatedAt: now,
  });

  // Side-effects — best-effort. If a webhook is missing or fails we still
  // return the created task; the caller can choose whether to retry.
  if (!body.silent) {
    if (created.assigneeEmail) {
      try {
        await sendSlackMessage({
          text: `:clipboard: Task assigned to *${created.assigneeEmail}* — _${created.title}_ (priority: ${created.priority})${created.dueDate ? `, due ${created.dueDate.slice(0, 10)}` : ""}`,
        });
      } catch (err) {
        context.log.warn(`Slack notification failed: ${(err as Error).message}`);
      }
    }
    if (created.dueDate) {
      try {
        const due = new Date(created.dueDate);
        if (!Number.isNaN(due.getTime())) {
          // Treat dueDate as an all-day event when no time component is set.
          const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(created.dueDate);
          const start = isDateOnly
            ? { date: created.dueDate.slice(0, 10) }
            : { dateTime: created.dueDate };
          const endIso = new Date(due.getTime() + 30 * 60 * 1000).toISOString();
          const end = isDateOnly
            ? { date: created.dueDate.slice(0, 10) }
            : { dateTime: endIso };
          await createGCalEvent({
            summary: `[Task due] ${created.title}`,
            description: created.description || `Task ${created.id} (priority: ${created.priority}).`,
            start,
            end,
            attendees: created.assigneeEmail
              ? [{ email: created.assigneeEmail }]
              : undefined,
            extendedProperties: {
              private: {
                kitTaskId: created.id,
                kitTenantId: tenantId,
              },
            },
            sendUpdates: "externalOnly",
          });
        }
      } catch (err) {
        context.log.warn(`Calendar event create failed: ${(err as Error).message}`);
      }
    }
  }

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
