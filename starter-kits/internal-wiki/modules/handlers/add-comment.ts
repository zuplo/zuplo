import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { commentRepository } from "../repositories/comments.ts";

interface Body {
  body: string;
  authorEmail: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const pageId = request.params.id;
  const body = (await request.json()) as Body;

  const created = await commentRepository.create(tenantId, {
    pageId,
    body: body.body,
    authorEmail: body.authorEmail,
    postedAt: new Date().toISOString(),
    resolvedAt: null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
