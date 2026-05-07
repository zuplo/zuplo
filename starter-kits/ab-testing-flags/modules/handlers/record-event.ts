import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { eventRepository } from "../repositories/experiments.ts";

interface Body {
  experimentKey: string;
  userId: string;
  metricKey: string;
  value?: number;
  occurredAt?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await eventRepository.create(tenantId, {
    experimentKey: body.experimentKey,
    userId: body.userId,
    metricKey: body.metricKey,
    value: body.value ?? 1,
    occurredAt: body.occurredAt ?? new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
