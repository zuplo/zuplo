import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { incidentRepository } from "../repositories/incidents.ts";
import { incidentUpdateRepository } from "../repositories/incident-updates.ts";
import { componentRepository } from "../repositories/components.ts";
import {
  verifyDatadogWebhook,
  tagValue,
  tagValues,
  type DatadogAlert,
} from "../integrations/datadog.ts";
import { fanoutToSubscribers } from "../integrations/fanout.ts";

/**
 * POST /webhooks/datadog
 *
 * Datadog Monitor / Synthetic webhook → status page incident.
 *
 * Tag conventions on the firing monitor:
 *   - `severity:minor|major|critical` (defaults to `major`)
 *   - `component:<slug>` (one or more) — the affected components on the page
 *
 * On `Triggered` we open an incident, push affected components to a non-green
 * status, and fan out to subscribers. On `Recovered` we resolve.
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

  let alert: DatadogAlert;
  try {
    alert = JSON.parse(rawBody) as DatadogAlert;
  } catch {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "invalid JSON" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const severity = (tagValue(alert, "severity") ?? "major") as "minor" | "major" | "critical";
  const components = tagValues(alert, "component");
  const status = alert.alertStatus ?? "Triggered";
  const isRecovery = status === "Recovered";

  // Look up an existing incident keyed by Datadog alertId.
  const existingPage = await incidentRepository.list(tenantId, { limit: 200 });
  const existing = alert.alertId
    ? existingPage.items.find((i) => i.body.startsWith(`dd:${alert.alertId}`))
    : undefined;

  if (isRecovery && existing) {
    const now = new Date().toISOString();
    await incidentRepository.update(tenantId, existing.id, {
      status: "resolved",
      resolvedAt: now,
    });
    await incidentUpdateRepository.create(tenantId, {
      incidentId: existing.id,
      body: `Datadog reports the underlying alert recovered (${alert.monitorName ?? "monitor"}).`,
      postedAt: now,
      status: "resolved",
    });
    await fanoutToSubscribers(
      tenantId,
      {
        subject: `[Resolved] ${existing.title}`,
        text: "Datadog reports the underlying alert recovered.",
        impact: existing.impact === "none" ? "minor" : existing.impact,
        affectedComponents: existing.affectedComponentSlugs ?? [],
        dedupKey: `dd:${alert.alertId}:resolved`,
      },
      context,
    );
    return new Response(
      JSON.stringify({ ok: true, action: "resolved", incidentId: existing.id }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  if (existing && !isRecovery) {
    return new Response(
      JSON.stringify({ ok: true, action: "ignored", reason: "already open", incidentId: existing.id }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  // Create the incident.
  const now = new Date().toISOString();
  const incident = await incidentRepository.create(tenantId, {
    title: alert.title ?? alert.monitorName ?? "Service degradation",
    body: `dd:${alert.alertId ?? "unknown"} — ${alert.body ?? ""}`,
    status: "investigating",
    impact: severity,
    affectedComponentSlugs: components,
    startedAt: now,
    resolvedAt: null,
    kind: "incident",
    createdAt: now,
  });

  // Bump component statuses.
  const newComponentStatus =
    severity === "critical"
      ? "major_outage"
      : severity === "major"
        ? "partial_outage"
        : "degraded";
  for (const slug of components) {
    try {
      const comps = await componentRepository.list(tenantId, { limit: 200 });
      const c = comps.items.find((x) => x.slug === slug);
      if (c) {
        await componentRepository.update(tenantId, c.id, {
          status: newComponentStatus,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      context.log.warn(
        `Component update failed for ${slug}: ${(err as Error).message}`,
      );
    }
  }

  // Fan out.
  await fanoutToSubscribers(
    tenantId,
    {
      subject: `[Status] ${severity.toUpperCase()}: ${incident.title}`,
      text: alert.body ?? incident.title,
      impact: severity,
      affectedComponents: components,
      dedupKey: `dd:${alert.alertId ?? incident.id}:open`,
    },
    context,
  );

  return new Response(
    JSON.stringify({ ok: true, action: "created", incidentId: incident.id }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
