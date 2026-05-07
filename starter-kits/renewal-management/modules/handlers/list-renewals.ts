import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { renewalRepository } from "../repositories/renewals.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const ownerEmail = url.searchParams.get("ownerEmail") ?? undefined;
  const riskTier = url.searchParams.get("riskTier") ?? undefined;

  const page = await renewalRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "renewsOn", direction: "asc" },
  });

  const items = page.items.filter((r) => {
    if (status && r.status !== status) return false;
    if (ownerEmail && r.ownerEmail !== ownerEmail) return false;
    if (riskTier && r.riskTier !== riskTier) return false;
    return true;
  });

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
