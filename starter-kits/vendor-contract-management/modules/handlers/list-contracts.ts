import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { contractRepository } from "../repositories/contracts.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const page = await contractRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "endDate", direction: "asc" },
  });

  return new Response(JSON.stringify(page), {
    headers: { "content-type": "application/json" },
  });
}
