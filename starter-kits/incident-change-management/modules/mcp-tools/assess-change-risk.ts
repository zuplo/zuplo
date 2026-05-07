import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  changeRepository,
  incidentRepository,
  type Change,
} from "../repositories/incidents.ts";

/**
 * Orchestrator: assess_change_risk.
 *
 * Reads a change and computes a risk score from:
 *   - kind: emergency=high, normal=med, standard=low
 *   - affectedServices count: more services touched => more risk
 *   - recent failures count: incidents declared in last 14 days touching any
 *     of the same services raise the risk
 *
 * Returns a numeric score (0-100), a categorical bucket, and the contributing
 * factors so the LLM can explain the assessment.
 */

interface Body {
  changeId: string;
}

type RiskBucket = "low" | "med" | "high" | "critical";

const KIND_SCORES: Record<Change["kind"], number> = {
  standard: 10,
  normal: 30,
  emergency: 60,
};

function bucketFor(score: number): RiskBucket {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "med";
  return "low";
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.changeId) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "changeId is required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const tenantId = requireTenant(request);

  const change = await changeRepository.get(tenantId, body.changeId);
  if (!change) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Change not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  // Kind contribution
  const kindScore = KIND_SCORES[change.kind] ?? 30;

  // Service-count contribution: 5 points per service, capped at 25.
  const services = change.affectedServices ?? [];
  const servicesScore = Math.min(25, services.length * 5);

  // Recent failures: list incidents declared in the last 14 days that touch
  // any of the same services. Up to 3 points per overlapping incident, capped
  // at 30.
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const overlappingIncidents: Array<{
    id: string;
    title: string;
    declaredAt: string;
    severity: string;
  }> = [];
  let cursor: string | null | undefined;
  do {
    const page = await incidentRepository.list(tenantId, {
      limit: 200,
      cursor: cursor ?? undefined,
      orderBy: { field: "declaredAt", direction: "desc" },
    });
    for (const inc of page.items) {
      if (Date.parse(inc.declaredAt) < cutoff.getTime()) {
        cursor = null;
        break;
      }
      const overlap = (inc.affectedServices ?? []).some((s) =>
        services.includes(s),
      );
      if (overlap) {
        overlappingIncidents.push({
          id: inc.id,
          title: inc.title,
          declaredAt: inc.declaredAt,
          severity: inc.severity,
        });
      }
    }
    if (cursor === null) break;
    cursor = page.nextCursor;
  } while (cursor);

  const recentFailuresScore = Math.min(30, overlappingIncidents.length * 3);

  const score = Math.min(100, kindScore + servicesScore + recentFailuresScore);
  const bucket = bucketFor(score);

  const factors = [
    {
      name: "kind",
      detail: `change.kind=${change.kind}`,
      weight: kindScore,
    },
    {
      name: "affected_services",
      detail: `${services.length} service(s) affected`,
      weight: servicesScore,
    },
    {
      name: "recent_failures",
      detail: `${overlappingIncidents.length} overlapping incident(s) in last 14 days`,
      weight: recentFailuresScore,
    },
  ];

  return new Response(
    JSON.stringify({
      changeId: change.id,
      title: change.title,
      kind: change.kind,
      declaredRiskLevel: change.riskLevel,
      affectedServices: services,
      score,
      bucket,
      factors,
      overlappingIncidents,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
