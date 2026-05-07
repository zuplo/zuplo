import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { timesheetRepository } from "../repositories/timesheets.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const employeeId = url.searchParams.get("employeeId");
  const status = url.searchParams.get("status");

  const page = await timesheetRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "weekStartDate", direction: "desc" },
  });

  let items = page.items;
  if (employeeId) items = items.filter((t) => t.employeeId === employeeId);
  if (status) items = items.filter((t) => t.status === status);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
