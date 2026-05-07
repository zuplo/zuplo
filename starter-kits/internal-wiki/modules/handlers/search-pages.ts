import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { pageRepository } from "../repositories/pages.ts";

/**
 * Simple title/body substring search across pages in the tenant. Production
 * forks would push this to a real search index; the kit demonstrates the
 * shape of the contract.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10),
    200,
  );

  if (!q) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "q query parameter is required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const page = await pageRepository.list(tenantId, {
    limit: 200,
    orderBy: { field: "lastEditedAt", direction: "desc" },
  });

  const matches = page.items
    .filter(
      (p) =>
        p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q),
    )
    .slice(0, limit);

  return new Response(
    JSON.stringify({ items: matches, query: q }),
    { headers: { "content-type": "application/json" } },
  );
}
