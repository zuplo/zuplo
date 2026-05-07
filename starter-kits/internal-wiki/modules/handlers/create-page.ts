import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { pageRepository, type Page } from "../repositories/pages.ts";

interface Body {
  spaceSlug: string;
  slug: string;
  title: string;
  body: string;
  authorEmail: string;
  parentPageId?: string | null;
  status?: Page["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const created = await pageRepository.create(tenantId, {
    spaceSlug: body.spaceSlug,
    slug: body.slug,
    title: body.title,
    body: body.body,
    parentPageId: body.parentPageId ?? null,
    status: body.status ?? "draft",
    authorEmail: body.authorEmail,
    lastEditedBy: body.authorEmail,
    lastEditedAt: now,
    viewCount: 0,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
