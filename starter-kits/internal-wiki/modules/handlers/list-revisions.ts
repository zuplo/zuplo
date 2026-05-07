import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { revisionRepository } from "../repositories/revisions.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const pageId = request.params.id;
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");

  const page = await revisionRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    orderBy: { field: "savedAt", direction: "desc" },
  });

  const items = page.items.filter((r) => r.pageId === pageId);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
