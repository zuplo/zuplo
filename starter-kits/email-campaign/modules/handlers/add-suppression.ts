import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { suppressionRepository } from "../repositories/suppressions.ts";

interface Body {
  email: string;
  reason: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const created = await suppressionRepository.create(tenantId, {
    email: body.email,
    reason: body.reason,
    addedAt: now,
    createdAt: now,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
