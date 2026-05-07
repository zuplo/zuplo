import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { taskRepository, type Task } from "../repositories/tasks.ts";

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
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;

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
