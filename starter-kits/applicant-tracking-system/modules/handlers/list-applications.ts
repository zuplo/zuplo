import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { applicationRepository } from "../repositories/applications.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const candidateId = url.searchParams.get("candidateId");
  const jobId = url.searchParams.get("jobId");
  const stage = url.searchParams.get("stage");

  const page = await applicationRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "createdAt", direction: "desc" },
  });

  let items = page.items;
  if (candidateId) items = items.filter((a) => a.candidateId === candidateId);
  if (jobId) items = items.filter((a) => a.jobId === jobId);
  if (stage) items = items.filter((a) => a.stage === stage);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
