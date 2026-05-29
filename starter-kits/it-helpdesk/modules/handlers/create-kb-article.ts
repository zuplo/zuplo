import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { kbArticleRepository, type KBArticle } from "../repositories/tickets.ts";

interface Body {
  title: string;
  body: string;
  tags?: string[];
  category?: KBArticle["category"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await kbArticleRepository.create(tenantId, {
    title: body.title,
    body: body.body,
    tags: body.tags ?? [],
    category: body.category ?? "other",
    helpfulCount: 0,
    lastUpdatedAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
