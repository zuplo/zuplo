import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { funnelRepository } from "../repositories/events.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const slug = request.params.slug;

  // Look the funnel up by slug. Funnels are typically a small set so a single
  // page scan is fine.
  let cursor: string | null | undefined;
  do {
    const page = await funnelRepository.list(tenantId, {
      limit: 200,
      cursor: cursor ?? undefined,
    });
    const match = page.items.find((f) => f.slug === slug);
    if (match) {
      return new Response(JSON.stringify(match), {
        headers: { "content-type": "application/json" },
      });
    }
    cursor = page.nextCursor;
  } while (cursor);

  return new Response(
    JSON.stringify({ error: { type: "not_found", message: "Funnel not found" } }),
    { status: 404, headers: { "content-type": "application/json" } },
  );
}
