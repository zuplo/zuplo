import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { negotiationRepository } from "../repositories/negotiations.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const renewalId = url.searchParams.get("renewalId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;

  const page = await negotiationRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
  });

  const items = page.items.filter((n) => {
    if (renewalId && n.renewalId !== renewalId) return false;
    if (status && n.status !== status) return false;
    return true;
  });

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
