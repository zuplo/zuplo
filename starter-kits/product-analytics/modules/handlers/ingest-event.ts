import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { eventRepository } from "../repositories/events.ts";
import { capturePostHogEvent } from "../integrations/posthog.ts";

interface Body {
  userId: string;
  name: string;
  properties?: Record<string, unknown>;
  occurredAt?: string;
  sessionId?: string | null;
  deviceId?: string | null;
  ip?: string | null;
}

/**
 * Ingest a single event. Persists to the configured DB_PROVIDER (ClickHouse
 * is recommended for events) and best-effort fans the event out to PostHog
 * via /capture so existing PostHog dashboards see the stream too.
 *
 * The fan-out is fire-and-forget: a PostHog outage never blocks ingest.
 */
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

  const env = environment as Record<string, string | undefined>;
  if (env.POSTHOG_API_KEY) {
    capturePostHogEvent({
      distinctId: body.userId,
      event: body.name,
      timestamp: created.occurredAt,
      properties: {
        ...(body.properties ?? {}),
        $session_id: body.sessionId ?? undefined,
        $device_id: body.deviceId ?? undefined,
        $ip: body.ip ?? undefined,
        zuplo_event_id: created.id,
        zuplo_tenant_id: tenantId,
      },
    }).catch((err) => context.log.warn("PostHog capture failed", { err: String(err) }));
  }

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
