import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { onboardingTaskRepository } from "../repositories/onboarding-tasks.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const hireId = url.searchParams.get("hireId");
  const status = url.searchParams.get("status");
  const ownerEmail = url.searchParams.get("ownerEmail");
  const category = url.searchParams.get("category");

  const page = await onboardingTaskRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "dueDate", direction: "asc" },
  });

  let items = page.items;
  if (hireId) items = items.filter((t) => t.hireId === hireId);
  if (status) items = items.filter((t) => t.status === status);
  if (ownerEmail) items = items.filter((t) => t.ownerEmail === ownerEmail);
  if (category) items = items.filter((t) => t.category === category);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
