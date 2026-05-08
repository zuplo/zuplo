import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { evidenceRepository } from "../repositories/evidence.ts";
import {
  verifyDatadogWebhook,
  type DatadogWebhookPayload,
} from "../integrations/datadog.ts";
import { putEvidence } from "../integrations/r2.ts";

/**
 * POST /webhooks/datadog
 *
 * Datadog Monitor / Synthetic webhook. Each fired alert (or recovery) is
 * converted into a piece of `kind: log` evidence on the control referenced
 * by the monitor's `control:` tag (e.g. `control:CC6.1`).
 *
 * The raw payload is also written to R2 so the auditor has the original
 * Datadog evaluation snapshot, not just our derived fields.
 *
 * Configure on the Datadog side:
 *   - Integrations → Webhooks → New
 *   - URL: https://<your-zuplo>/webhooks/datadog
 *   - Custom Header: x-datadog-signature: <hmac sha256 of body using DATADOG_WEBHOOK_SECRET>
 *   - Payload: include $EVENT_TITLE, $EVENT_MSG, $ALERT_STATUS, $ALERT_TYPE,
 *     $ID, $METRIC_NAME, $MONITOR_NAME, plus tags via $TAGS.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const rawBody = await request.text();
  if (!(await verifyDatadogWebhook(request, rawBody))) {
    return new Response(
      JSON.stringify({ error: { type: "unauthorized", message: "invalid signature" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  const tenantId = requireTenant(request);

  let payload: DatadogWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as DatadogWebhookPayload;
  } catch {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "invalid JSON" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const tags = payload.tags ?? [];
  const controlTag = tags.find((t) => t.startsWith("control:"));
  if (!controlTag) {
    // No control tag → nothing to attach this to. We acknowledge so Datadog
    // doesn't retry, and log for visibility.
    context.log.warn(
      `Datadog webhook ignored: no control:* tag (monitor=${payload.monitorName})`,
    );
    return new Response(
      JSON.stringify({ ok: true, ignored: true, reason: "no control tag" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  const controlId = controlTag.slice("control:".length);
  const collectedAt = payload.eventTime
    ? new Date(payload.eventTime * 1000).toISOString()
    : new Date().toISOString();

  // Persist the raw body to R2 so the auditor sees the unredacted Datadog
  // evaluation. The R2 key is deterministic per alert + tenant.
  const key = `${tenantId}/${controlId}/datadog/${payload.alertId ?? cryptoRandomKey()}.json`;
  const put = await putEvidence(key, rawBody, { contentType: "application/json" });

  const created = await evidenceRepository.create(tenantId, {
    controlId,
    kind: "log",
    title: payload.title ?? `Datadog ${payload.alertStatus ?? "alert"}: ${payload.monitorName ?? "monitor"}`,
    description: payload.body ?? "",
    fileUrl: put.url,
    sha256: put.sha256,
    collectedAt,
    collectedBy: "datadog-webhook",
    validUntil: null,
    status: "current",
    createdAt: new Date().toISOString(),
  });

  context.log.info(
    `Datadog webhook → evidence ${created.id} on control ${controlId}`,
  );
  return new Response(
    JSON.stringify({ ok: true, evidenceId: created.id, controlId }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function cryptoRandomKey(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
