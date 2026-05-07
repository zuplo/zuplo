import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { eventRepository } from "../repositories/events.ts";

interface Body {
  userId: string;
  name: string;
  properties?: Record<string, unknown>;
  occurredAt?: string;
  sessionId?: string | null;
  deviceId?: string | null;
  ip?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const now = new Date().toISOString();
  const created = await eventRepository.create(tenantId, {
    userId: body.userId,
    name: body.name,
    properties: body.properties ?? {},
    occurredAt: body.occurredAt ?? now,
    sessionId: body.sessionId ?? null,
    deviceId: body.deviceId ?? null,
    ip: body.ip ?? null,
    createdAt: now,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
