import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { funnelRepository } from "../repositories/events.ts";

interface Body {
  slug: string;
  name: string;
  steps: Array<{ eventName: string; filters?: Record<string, unknown> }>;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await funnelRepository.create(tenantId, {
    slug: body.slug,
    name: body.name,
    steps: (body.steps ?? []).map((s) => ({
      eventName: s.eventName,
      filters: s.filters ?? {},
    })),
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
