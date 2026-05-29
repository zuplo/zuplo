import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { subtaskRepository } from "../repositories/subtasks.ts";

interface Body {
  parentTaskId: string;
  title: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await subtaskRepository.create(tenantId, {
    parentTaskId: body.parentTaskId,
    title: body.title,
    status: "todo",
    completedAt: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
