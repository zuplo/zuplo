import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { riskFactorRepository } from "../repositories/risk-factors.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const renewalId = url.searchParams.get("renewalId") ?? undefined;
  const open = url.searchParams.get("open");

  const page = await riskFactorRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "addedAt", direction: "desc" },
  });

  const items = page.items.filter((rf) => {
    if (renewalId && rf.renewalId !== renewalId) return false;
    if (open === "true" && rf.addressedAt !== null) return false;
    if (open === "false" && rf.addressedAt === null) return false;
    return true;
  });

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
