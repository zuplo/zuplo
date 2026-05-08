import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { incidentRepository } from "../repositories/incidents.ts";
import {
  verifyPagerDutyWebhook,
  type PagerDutyIncident,
  type PagerDutyWebhookEvent,
} from "../integrations/pagerduty.ts";
import { postSlackMessage } from "../integrations/slack.ts";

/**
 * POST /webhooks/pagerduty
 *
 * Verifies the HMAC signature, then maps PagerDuty events onto our
 * incident store and broadcasts to Slack:
 *   - incident.triggered → create Incident, post to Slack
 *   - incident.acknowledged → update status, post to Slack
 *   - incident.resolved → mark resolved, post to Slack
 *
 * Other event types are acknowledged and logged.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  // Read raw body once for signature verification, then JSON-parse.
  const rawBody = await request.text();
  if (!(await verifyPagerDutyWebhook(request, rawBody))) {
    return new Response(
      JSON.stringify({ error: { type: "unauthorized", message: "invalid signature" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  const tenantId = requireTenant(request);

  let envelope: PagerDutyWebhookEvent;
  try {
    envelope = JSON.parse(rawBody) as PagerDutyWebhookEvent;
  } catch {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "invalid JSON" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const evt = envelope.event;
  const data = evt?.data as PagerDutyIncident | undefined;

  if (!evt || !data) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "missing event.data" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // Look up an existing incident keyed by PagerDuty incident_key (we store it
  // in `description` prefix `pd:<id>` for simplicity — production would use a
  // dedicated column).
  const existingPage = await incidentRepository.list(tenantId, { limit: 200 });
  const existing = existingPage.items.find((i) =>
    i.description.startsWith(`pd:${data.id}`),
  );

  let incidentId = existing?.id ?? null;
  let action: "created" | "updated" | "ignored" = "ignored";

  switch (evt.event_type) {
    case "incident.triggered": {
      if (existing) {
        action = "ignored";
        incidentId = existing.id;
      } else {
        const created = await incidentRepository.create(tenantId, {
          title: data.title,
          description: `pd:${data.id} — ${data.service.summary}`,
          severity: data.urgency === "high" ? "sev1" : "sev3",
          status: "investigating",
          commanderEmail: data.assignees[0]?.summary ?? "oncall@example.com",
          declaredAt: data.created_at,
          resolvedAt: null,
          affectedServices: [data.service.summary],
          rootCause: null,
        });
        incidentId = created.id;
        action = "created";
      }
      break;
    }
    case "incident.acknowledged": {
      if (existing) {
        await incidentRepository.update(tenantId, existing.id, {
          status: "investigating",
        });
        action = "updated";
      }
      break;
    }
    case "incident.resolved": {
      if (existing) {
        await incidentRepository.update(tenantId, existing.id, {
          status: "resolved",
          resolvedAt: data.resolved_at ?? new Date().toISOString(),
        });
        action = "updated";
      }
      break;
    }
    default: {
      context.log.info(`PagerDuty ${evt.event_type} not handled (incident=${data.id})`);
    }
  }

  // Fan out to Slack on triggered and resolved.
  if (action !== "ignored") {
    try {
      const verb =
        evt.event_type === "incident.triggered"
          ? "TRIGGERED"
          : evt.event_type === "incident.resolved"
            ? "RESOLVED"
            : "UPDATED";
      const text = [
        `*PagerDuty ${verb}: ${data.title}*`,
        `Service: ${data.service.summary}`,
        `Urgency: ${data.urgency}`,
        `<${data.html_url}|Open in PagerDuty>`,
      ].join("\n");
      await postSlackMessage({ text });
    } catch (err) {
      context.log.warn(`Slack fanout failed: ${(err as Error).message}`);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, action, incidentId }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
