import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { jobRepository } from "../repositories/jobs.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const status = url.searchParams.get("status");
  const technicianEmail = url.searchParams.get("technicianEmail");
  const customerId = url.searchParams.get("customerId");
  const kind = url.searchParams.get("kind");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const page = await jobRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "scheduledFor", direction: "asc" },
  });

  let items = page.items;
  if (status) items = items.filter((j) => j.status === status);
  if (technicianEmail) items = items.filter((j) => j.technicianEmail === technicianEmail);
  if (customerId) items = items.filter((j) => j.customerId === customerId);
  if (kind) items = items.filter((j) => j.kind === kind);
  if (from) items = items.filter((j) => j.scheduledFor >= from);
  if (to) items = items.filter((j) => j.scheduledFor < to);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
