import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { surveyRepository, type Survey } from "../repositories/surveys.ts";

interface Body {
  slug: string;
  title: string;
  description?: string;
  kind: Survey["kind"];
  anonymous?: boolean;
  closesAt?: string;
  audienceSlug?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await surveyRepository.create(tenantId, {
    slug: body.slug,
    title: body.title,
    description: body.description ?? "",
    kind: body.kind,
    status: "draft",
    openedAt: null,
    closesAt: body.closesAt ?? null,
    anonymous: body.anonymous ?? false,
    audienceSlug: body.audienceSlug ?? null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
