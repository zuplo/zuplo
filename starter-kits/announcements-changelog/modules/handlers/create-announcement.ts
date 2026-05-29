import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { announcementRepository, type Announcement } from "../repositories/announcements.ts";

interface Body {
  title: string;
  body: string;
  kind: Announcement["kind"];
  audienceSlug: string;
  authorEmail: string;
  priority?: Announcement["priority"];
  status?: Announcement["status"];
  scheduledFor?: string | null;
  categorySlug?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await announcementRepository.create(tenantId, {
    title: body.title,
    body: body.body,
    kind: body.kind,
    audienceSlug: body.audienceSlug,
    authorEmail: body.authorEmail,
    priority: body.priority ?? "normal",
    status: body.status ?? "draft",
    scheduledFor: body.scheduledFor ?? null,
    publishedAt: null,
    categorySlug: body.categorySlug ?? null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
