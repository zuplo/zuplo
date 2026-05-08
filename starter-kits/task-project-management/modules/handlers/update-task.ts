import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { taskRepository, type Task } from "../repositories/tasks.ts";
import { sendSlackMessage } from "../integrations/slack.ts";

interface Body {
  title?: string;
  description?: string;
  assigneeEmail?: string | null;
  priority?: Task["priority"];
  status?: Task["status"];
  dueDate?: string | null;
  customFields?: Record<string, unknown>;
  labels?: string[];
  estimateHours?: number | null;
  /** When true, suppress side-effects (Slack post). */
  silent?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;

  const before = await taskRepository.get(tenantId, id).catch(() => null);
  const beforeStatus = before?.status;
  const beforeAssignee = before?.assigneeEmail;

  const patch: Partial<Task> = { updatedAt: new Date().toISOString() };
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.assigneeEmail !== undefined)
    patch.assigneeEmail = body.assigneeEmail;
  if (body.priority !== undefined) patch.priority = body.priority;
  if (body.status !== undefined) {
    patch.status = body.status;
    if (body.status === "done") {
      patch.completedAt = new Date().toISOString();
    } else {
      patch.completedAt = null;
    }
  }
  if (body.dueDate !== undefined) patch.dueDate = body.dueDate;
  if (body.customFields !== undefined) patch.customFields = body.customFields;
  if (body.labels !== undefined) patch.labels = body.labels;
  if (body.estimateHours !== undefined) patch.estimateHours = body.estimateHours;

  try {
    const updated = await taskRepository.update(tenantId, id, patch);

    if (!body.silent) {
      const statusChanged =
        body.status !== undefined && body.status !== beforeStatus;
      const reassigned =
        body.assigneeEmail !== undefined &&
        body.assigneeEmail !== beforeAssignee;

      if (reassigned && updated.assigneeEmail) {
        try {
          await sendSlackMessage({
            text: `:arrows_counterclockwise: Task *${updated.title}* reassigned to *${updated.assigneeEmail}* (was ${beforeAssignee ?? "unassigned"})`,
          });
        } catch (err) {
          context.log.warn(`Slack reassign notification failed: ${(err as Error).message}`);
        }
      } else if (statusChanged) {
        try {
          const owner = updated.assigneeEmail ?? "unassigned";
          await sendSlackMessage({
            text: `:bookmark: Task *${updated.title}* moved \`${beforeStatus ?? "?"}\` → \`${updated.status}\` (owner: ${owner})`,
          });
        } catch (err) {
          context.log.warn(`Slack status notification failed: ${(err as Error).message}`);
        }
      }
    }

    return new Response(JSON.stringify(updated), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({
          error: { type: "not_found", message: err.message },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }
}
