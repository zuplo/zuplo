import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { playbookRunRepository } from "../repositories/playbook-runs.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const accountId = url.searchParams.get("accountId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;

  const page = await playbookRunRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "startedAt", direction: "desc" },
  });

  const items = page.items.filter((r) => {
    if (accountId && r.accountId !== accountId) return false;
    if (status && r.status !== status) return false;
    return true;
  });

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
