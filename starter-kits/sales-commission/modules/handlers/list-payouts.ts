import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { payoutRepository } from "../repositories/payouts.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const period = url.searchParams.get("period");
  const repEmail = url.searchParams.get("repEmail");

  const page = await payoutRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
  });

  let items = page.items;
  if (period) items = items.filter((p) => p.period === period);
  if (repEmail) items = items.filter((p) => p.repEmail.toLowerCase() === repEmail.toLowerCase());

  return new Response(JSON.stringify({ items, nextCursor: page.nextCursor }), {
    headers: { "content-type": "application/json" },
  });
}
