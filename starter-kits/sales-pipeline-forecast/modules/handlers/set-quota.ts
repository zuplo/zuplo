import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { quotaRepository } from "../repositories/quotas.ts";

interface Body {
  repEmail: string;
  period: string;
  quotaCents: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const created = await quotaRepository.create(tenantId, {
    repEmail: body.repEmail,
    period: body.period,
    quotaCents: body.quotaCents,
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
