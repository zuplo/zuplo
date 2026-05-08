import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  incidentRepository,
  type Incident,
} from "../repositories/incidents.ts";
import { fanoutToSubscribers } from "../integrations/fanout.ts";

interface Body {
  title: string;
  body: string;
  impact: Incident["impact"];
  affectedComponentSlugs?: string[];
  status?: Incident["status"];
  kind?: Incident["kind"];
  /** When true, suppress fanout (useful for dry-runs / drills). */
  suppressFanout?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const created = await incidentRepository.create(tenantId, {
    title: body.title,
    body: body.body,
    status: body.status ?? "investigating",
    impact: body.impact,
    affectedComponentSlugs: body.affectedComponentSlugs ?? [],
    startedAt: now,
    resolvedAt: null,
    kind: body.kind ?? "incident",
    createdAt: now,
  });

  // Fan out to subscribers across email + sms + slack per their preferences.
  let fanout = { attempted: 0, delivered: 0, errors: [] as unknown[] };
  if (!body.suppressFanout && (created.kind ?? "incident") === "incident") {
    try {
      const r = await fanoutToSubscribers(
        tenantId,
        {
          subject: `[Status] ${created.impact.toUpperCase()}: ${created.title}`,
          text: created.body,
          impact: created.impact === "none" ? "minor" : created.impact,
          affectedComponents: created.affectedComponentSlugs ?? [],
          dedupKey: `incident:${created.id}:open`,
        },
        context,
      );
      fanout = r;
    } catch (err) {
      context.log.warn(`Fanout failed for incident ${created.id}: ${(err as Error).message}`);
    }
  }

  return new Response(JSON.stringify({ ...created, fanout }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
