import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { touchpointRepository, type Touchpoint } from "../repositories/touchpoints.ts";

interface Body {
  visitorId: string;
  channel: Touchpoint["channel"];
  campaignName?: string;
  source?: string;
  medium?: string;
  occurredAt?: string;
  url: string;
  sessionId?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await touchpointRepository.create(tenantId, {
    visitorId: body.visitorId,
    channel: body.channel,
    campaignName: body.campaignName ?? "",
    source: body.source ?? "",
    medium: body.medium ?? "",
    occurredAt: body.occurredAt ?? new Date().toISOString(),
    url: body.url,
    sessionId: body.sessionId ?? "",
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
