import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { taskRepository, type Task } from "../repositories/tasks.ts";

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

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
