import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  incidentRepository,
  type Incident,
} from "../repositories/incidents.ts";

interface Body {
  title: string;
  body: string;
  impact: Incident["impact"];
  affectedComponentSlugs?: string[];
  status?: Incident["status"];
  kind?: Incident["kind"];
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

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
