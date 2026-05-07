import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { cohortRepository } from "../repositories/events.ts";

interface Body {
  slug: string;
  name: string;
  criteria: Record<string, unknown>;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await cohortRepository.create(tenantId, {
    slug: body.slug,
    name: body.name,
    criteria: body.criteria ?? {},
    userCount: 0,
    computedAt: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
