import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { responseRepository } from "../repositories/responses.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const surveyId = url.searchParams.get("surveyId") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const customerEmail = url.searchParams.get("customerEmail") ?? undefined;

  const page = await responseRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "respondedAt", direction: "desc" },
  });

  const items = page.items.filter((r) => {
    if (surveyId && r.surveyId !== surveyId) return false;
    if (category && r.category !== category) return false;
    if (customerEmail && r.customerEmail !== customerEmail) return false;
    return true;
  });

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
