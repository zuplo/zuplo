import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { entryRepository, type Entry } from "../repositories/entries.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const contentTypeSlug = url.searchParams.get("contentTypeSlug");
  const status = url.searchParams.get("status") as Entry["status"] | null;
  const locale = url.searchParams.get("locale");

  const page = await entryRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "updatedAt", direction: "desc" },
  });

  const filtered = page.items.filter((entry) => {
    if (contentTypeSlug && entry.contentTypeSlug !== contentTypeSlug) return false;
    if (status && entry.status !== status) return false;
    if (locale && entry.locale !== locale) return false;
    return true;
  });

  return new Response(
    JSON.stringify({ items: filtered, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
