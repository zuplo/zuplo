import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { macroRepository } from "../repositories/tickets.ts";

interface Body {
  name: string;
  body: string;
  tags?: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await macroRepository.create(tenantId, {
    name: body.name,
    body: body.body,
    tags: body.tags ?? [],
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
