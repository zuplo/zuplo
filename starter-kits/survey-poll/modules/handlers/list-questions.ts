import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { questionRepository } from "../repositories/surveys.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const surveyId = request.params.id;
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const page = await questionRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "displayOrder", direction: "asc" },
  });

  // Filter to this survey only.
  const filtered = {
    items: page.items.filter((q) => q.surveyId === surveyId),
    nextCursor: page.nextCursor,
  };

  return new Response(JSON.stringify(filtered), {
    headers: { "content-type": "application/json" },
  });
}
