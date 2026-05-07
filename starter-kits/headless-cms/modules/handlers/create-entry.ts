import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { entryRepository, type Entry } from "../repositories/entries.ts";

interface Body {
  contentTypeSlug: string;
  slug: string;
  locale?: string;
  status?: Entry["status"];
  title: string;
  body: string;
  excerpt?: string;
  authorEmail: string;
  publishedAt?: string | null;
  scheduledFor?: string | null;
  fields?: Record<string, unknown>;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const created = await entryRepository.create(tenantId, {
    contentTypeSlug: body.contentTypeSlug,
    slug: body.slug,
    locale: body.locale ?? "en",
    status: body.status ?? "draft",
    title: body.title,
    body: body.body,
    excerpt: body.excerpt ?? "",
    authorEmail: body.authorEmail,
    publishedAt: body.publishedAt ?? null,
    scheduledFor: body.scheduledFor ?? null,
    fields: body.fields ?? {},
    createdAt: now,
    updatedAt: now,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
