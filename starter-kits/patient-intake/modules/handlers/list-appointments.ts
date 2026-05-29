import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { appointmentRepository } from "../repositories/appointments.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const patientId = url.searchParams.get("patientId");
  const status = url.searchParams.get("status");

  const page = await appointmentRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "scheduledFor", direction: "asc" },
  });

  let items = page.items;
  if (patientId) items = items.filter((a) => a.patientId === patientId);
  if (status) items = items.filter((a) => a.status === status);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
