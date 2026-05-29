import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { timeEntryRepository } from "../repositories/time-entries.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const employeeId = url.searchParams.get("employeeId");
  const projectId = url.searchParams.get("projectId");
  const status = url.searchParams.get("status");
  const billable = url.searchParams.get("billable");
  const startTimeFrom = url.searchParams.get("startTimeFrom");
  const startTimeTo = url.searchParams.get("startTimeTo");

  const page = await timeEntryRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "startTime", direction: "desc" },
  });

  let items = page.items;
  if (employeeId) items = items.filter((e) => e.employeeId === employeeId);
  if (projectId) items = items.filter((e) => e.projectId === projectId);
  if (status) items = items.filter((e) => e.status === status);
  if (billable === "true") items = items.filter((e) => e.billable);
  if (billable === "false") items = items.filter((e) => !e.billable);
  if (startTimeFrom) items = items.filter((e) => e.startTime >= startTimeFrom);
  if (startTimeTo) items = items.filter((e) => e.startTime <= startTimeTo);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
