import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { signalRepository } from "../repositories/signals.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const accountId = url.searchParams.get("accountId") ?? undefined;
  const severity = url.searchParams.get("severity") ?? undefined;

  const page = await signalRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "detectedAt", direction: "desc" },
  });

  const items = page.items.filter((s) => {
    if (accountId && s.accountId !== accountId) return false;
    if (severity && s.severity !== severity) return false;
    return true;
  });

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
