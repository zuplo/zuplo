import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import type { ForecastCategory } from "../repositories/forecasts.ts";
import { forecastRepository } from "../repositories/forecasts.ts";

interface Body {
  repEmail: string;
  period: string;
  category: ForecastCategory;
  amountCents: number;
  comment?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const created = await forecastRepository.create(tenantId, {
    repEmail: body.repEmail,
    period: body.period,
    category: body.category,
    amountCents: body.amountCents,
    submittedAt: new Date().toISOString(),
    comment: body.comment ?? null,
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
