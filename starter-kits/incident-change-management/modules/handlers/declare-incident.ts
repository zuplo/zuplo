import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { incidentRepository, type Incident } from "../repositories/incidents.ts";

interface Body {
  title: string;
  description: string;
  severity: Incident["severity"];
  commanderEmail: string;
  affectedServices?: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await incidentRepository.create(tenantId, {
    title: body.title,
    description: body.description,
    severity: body.severity,
    status: "investigating",
    commanderEmail: body.commanderEmail,
    declaredAt: new Date().toISOString(),
    resolvedAt: null,
    affectedServices: body.affectedServices ?? [],
    rootCause: null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
