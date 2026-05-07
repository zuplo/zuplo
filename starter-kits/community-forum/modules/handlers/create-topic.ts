import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { topicRepository, type Topic } from "../repositories/topics.ts";

interface Body {
  categorySlug: string;
  title: string;
  body: string;
  authorEmail: string;
  status?: Topic["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await topicRepository.create(tenantId, {
    categorySlug: body.categorySlug,
    title: body.title,
    body: body.body,
    authorEmail: body.authorEmail,
    status: body.status ?? "open",
    postCount: 0,
    replyCount: 0,
    viewCount: 0,
    lastReplyAt: null,
    lastReplyBy: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
