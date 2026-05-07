import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { intakeSubmissionRepository } from "../repositories/intake-submissions.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const patientId = url.searchParams.get("patientId");
  const status = url.searchParams.get("status");

  const page = await intakeSubmissionRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "submittedAt", direction: "desc" },
  });

  let items = page.items;
  if (patientId) items = items.filter((s) => s.patientId === patientId);
  if (status) items = items.filter((s) => s.status === status);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
