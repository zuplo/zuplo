import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { goalRepository } from "../repositories/goals.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const employeeEmail = url.searchParams.get("employeeEmail");
  const status = url.searchParams.get("status");

  const page = await goalRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "dueDate", direction: "asc" },
  });

  let items = page.items;
  if (employeeEmail) items = items.filter((g) => g.employeeEmail === employeeEmail);
  if (status) items = items.filter((g) => g.status === status);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
