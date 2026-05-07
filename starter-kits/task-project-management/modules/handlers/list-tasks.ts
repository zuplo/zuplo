import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { taskRepository } from "../repositories/tasks.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const projectId = url.searchParams.get("projectId");
  const status = url.searchParams.get("status");
  const assigneeEmail = url.searchParams.get("assigneeEmail");

  const page = await taskRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "updatedAt", direction: "desc" },
  });

  let items = page.items;
  if (projectId) items = items.filter((t) => t.projectId === projectId);
  if (status) items = items.filter((t) => t.status === status);
  if (assigneeEmail)
    items = items.filter((t) => t.assigneeEmail === assigneeEmail);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
