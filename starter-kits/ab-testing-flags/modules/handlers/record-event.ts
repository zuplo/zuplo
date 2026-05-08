import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { eventRepository } from "../repositories/experiments.ts";
import { capturePostHogEvent } from "../integrations/posthog.ts";

interface Body {
  experimentKey: string;
  userId: string;
  metricKey: string;
  value?: number;
  occurredAt?: string;
}

/**
 * Record a conversion event for an experiment. Persists locally so the
 * results computation has a tenant-scoped audit trail, then fans out to
 * PostHog (if POSTHOG_API_KEY is set) so PostHog experiments + dashboards
 * stay in sync. The fan-out is best-effort and never blocks the persist.
 */
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

  const env = environment as Record<string, string | undefined>;
  if (env.POSTHOG_API_KEY) {
    capturePostHogEvent({
      distinctId: body.userId,
      event: body.metricKey,
      timestamp: created.occurredAt,
      properties: {
        experiment_key: body.experimentKey,
        value: body.value ?? 1,
        $set: { last_seen_via: "zuplo-ab-testing-flags" },
      },
    }).catch((err) => context.log.warn("PostHog capture failed", { err: String(err) }));
  }

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
