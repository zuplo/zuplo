import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { audienceRepository } from "../repositories/announcements.ts";

interface Body {
  slug: string;
  name: string;
  criteria?: Record<string, unknown>;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await audienceRepository.create(tenantId, {
    slug: body.slug,
    name: body.name,
    criteria: body.criteria ?? {},
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
