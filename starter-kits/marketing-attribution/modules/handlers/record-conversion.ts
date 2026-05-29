import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { conversionRepository, type Conversion } from "../repositories/touchpoints.ts";

interface Body {
  visitorId: string;
  kind: Conversion["kind"];
  valueCents?: number;
  occurredAt?: string;
  dealId?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await conversionRepository.create(tenantId, {
    visitorId: body.visitorId,
    kind: body.kind,
    valueCents: body.valueCents ?? 0,
    occurredAt: body.occurredAt ?? new Date().toISOString(),
    dealId: body.dealId ?? null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
