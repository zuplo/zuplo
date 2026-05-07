import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { eventRepository, type Event } from "../repositories/events.ts";

interface BodyEvent {
  userId: string;
  name: string;
  properties?: Record<string, unknown>;
  occurredAt?: string;
  sessionId?: string | null;
  deviceId?: string | null;
  ip?: string | null;
}

interface Body {
  events: BodyEvent[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const now = new Date().toISOString();
  const created: Event[] = [];

  // Sequential creates keep the in-memory adapter happy and are fine for the
  // sample volumes a starter kit handles. ClickHouse production deployments
  // should switch to a bulk insert RPC instead — see README.
  for (const e of body.events ?? []) {
    const ev = await eventRepository.create(tenantId, {
      userId: e.userId,
      name: e.name,
      properties: e.properties ?? {},
      occurredAt: e.occurredAt ?? now,
      sessionId: e.sessionId ?? null,
      deviceId: e.deviceId ?? null,
      ip: e.ip ?? null,
      createdAt: now,
    });
    created.push(ev);
  }

  return new Response(
    JSON.stringify({ count: created.length, events: created }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
