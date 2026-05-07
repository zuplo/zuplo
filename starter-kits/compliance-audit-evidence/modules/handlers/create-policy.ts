import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { policyRepository } from "../repositories/evidence.ts";

interface Body {
  slug: string;
  name: string;
  version: string;
  body: string;
  effectiveDate: string;
  ownerEmail: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await policyRepository.create(tenantId, {
    slug: body.slug,
    name: body.name,
    version: body.version,
    body: body.body,
    effectiveDate: body.effectiveDate,
    ownerEmail: body.ownerEmail,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
