import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { leaveRequestRepository } from "../repositories/leave-requests.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const employeeId = url.searchParams.get("employeeId");
  const status = url.searchParams.get("status");
  const startDateFrom = url.searchParams.get("startDateFrom");
  const startDateTo = url.searchParams.get("startDateTo");

  const page = await leaveRequestRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "createdAt", direction: "desc" },
  });

  // Optional in-memory filtering. Production adapters with rich query support
  // can push these as where-clauses.
  let items = page.items;
  if (employeeId) items = items.filter((r) => r.employeeId === employeeId);
  if (status) items = items.filter((r) => r.status === status);
  if (startDateFrom) items = items.filter((r) => r.startDate >= startDateFrom);
  if (startDateTo) items = items.filter((r) => r.startDate <= startDateTo);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
