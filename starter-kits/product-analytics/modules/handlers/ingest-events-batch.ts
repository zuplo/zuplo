import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { eventRepository, type Event } from "../repositories/events.ts";
import { capturePostHogBatch } from "../integrations/posthog.ts";

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

/**
 * Ingest a batch of events. Persists to the kit's repository (ClickHouse
 * recommended) and fans the batch out to PostHog's /batch/ endpoint
 * (capped at PostHog's 250-events-per-call limit by chunking).
 */
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

  const env = environment as Record<string, string | undefined>;
  if (env.POSTHOG_API_KEY && created.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < created.length; i += CHUNK) {
      const slice = created.slice(i, i + CHUNK);
      capturePostHogBatch({
        events: slice.map((ev) => ({
          distinctId: ev.userId,
          event: ev.name,
          timestamp: ev.occurredAt,
          properties: {
            ...(ev.properties ?? {}),
            $session_id: ev.sessionId ?? undefined,
            $device_id: ev.deviceId ?? undefined,
            $ip: ev.ip ?? undefined,
            zuplo_event_id: ev.id,
            zuplo_tenant_id: tenantId,
          },
        })),
      }).catch((err) => context.log.warn("PostHog batch failed", { err: String(err) }));
    }
  }

  return new Response(
    JSON.stringify({ count: created.length, events: created }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
