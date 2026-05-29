import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { contentTypeRepository, type ContentType } from "../repositories/entries.ts";

interface Body {
  slug: string;
  name: string;
  fields: ContentType["fields"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await contentTypeRepository.create(tenantId, {
    slug: body.slug,
    name: body.name,
    fields: body.fields,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
