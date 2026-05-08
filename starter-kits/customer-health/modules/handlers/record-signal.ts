import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { signalRepository, type Signal } from "../repositories/signals.ts";
import { capturePostHogEvent } from "../integrations/posthog.ts";

interface Body {
  accountId: string;
  kind: Signal["kind"];
  severity: Signal["severity"];
  value: number;
}

/**
 * Record a customer-health signal.
 *
 * Side-effect: when POSTHOG_PROJECT_API_KEY is configured, also captures
 * the signal into PostHog as a `health_signal_recorded` event so it shows
 * up in your existing analytics dashboards. Capture is best-effort —
 * failure does not roll back the DB write.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await signalRepository.create(tenantId, {
    accountId: body.accountId,
    kind: body.kind,
    severity: body.severity,
    value: body.value,
    detectedAt: new Date().toISOString(),
  });

  if (process.env.POSTHOG_PROJECT_API_KEY) {
    try {
      await capturePostHogEvent({
        event: "health_signal_recorded",
        distinctId: `${tenantId}:${body.accountId}`,
        properties: {
          kind: body.kind,
          severity: body.severity,
          value: body.value,
          signalId: created.id,
          tenantId,
        },
      });
    } catch (err) {
      context.log.warn(`PostHog capture failed: ${(err as Error).message}`);
    }
  }

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
