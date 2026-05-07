import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Incident } from "../repositories/incidents.ts";
import type { Component } from "../repositories/components.ts";
import type { IncidentUpdate } from "../repositories/incident-updates.ts";

/**
 * Orchestrator MCP tool: open_incident_from_alert.
 *
 * Given an alerting webhook payload (title, severity, affected components),
 * does the three things a human would do at 2am:
 *   1. Open a new Incident in `investigating` status
 *   2. Post the first IncidentUpdate so the timeline starts immediately
 *   3. Bump each affected Component's status to `degraded` or `partial_outage`
 *      depending on severity, so the public page stops lying about being green.
 *
 * Calls all three sibling routes through context.invokeRoute so it inherits
 * tenant scoping and rate limits.
 */

interface Body {
  alertTitle: string;
  severity: "minor" | "major" | "critical";
  affectedComponents: string[];
  body?: string;
}

function impactToComponentStatus(
  severity: Body["severity"],
): Component["status"] {
  if (severity === "critical") return "major_outage";
  if (severity === "major") return "partial_outage";
  return "degraded";
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.alertTitle || !body.severity) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "alertTitle and severity are required",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const headers = { authorization: auth, "content-type": "application/json" };

  // 1. Open the incident
  const incident = await invokeJson<Incident>(context, "/incidents", {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: body.alertTitle,
      body:
        body.body ??
        `Auto-opened from alert "${body.alertTitle}" with severity ${body.severity}.`,
      impact: body.severity,
      affectedComponentSlugs: body.affectedComponents,
      kind: "incident",
    }),
  });

  // 2. Post the initial timeline update
  const initialUpdate = await invokeJson<IncidentUpdate>(
    context,
    `/incidents/${incident.id}/updates`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        body: `We're investigating reports of an issue affecting ${body.affectedComponents.join(", ") || "the platform"}.`,
        status: "investigating",
      }),
    },
  );

  // 3. Push each affected component to a non-green status
  const newComponentStatus = impactToComponentStatus(body.severity);
  const componentUpdates: Array<{ slug: string; status: string }> = [];
  for (const slug of body.affectedComponents) {
    try {
      await invokeJson(context, `/components/${slug}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: newComponentStatus }),
      });
      componentUpdates.push({ slug, status: newComponentStatus });
    } catch {
      // skip components that don't exist by id; production fork would look up by slug.
    }
  }

  return new Response(
    JSON.stringify({
      incident,
      initialUpdate,
      componentUpdates,
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
