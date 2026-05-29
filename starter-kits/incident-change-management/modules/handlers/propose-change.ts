import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { changeRepository, type Change } from "../repositories/incidents.ts";

interface Body {
  title: string;
  description: string;
  kind: Change["kind"];
  riskLevel: Change["riskLevel"];
  scheduledFor: string;
  changeOwner: string;
  affectedServices?: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await changeRepository.create(tenantId, {
    title: body.title,
    description: body.description,
    kind: body.kind,
    riskLevel: body.riskLevel,
    scheduledFor: body.scheduledFor,
    status: "submitted",
    changeOwner: body.changeOwner,
    approverEmail: null,
    affectedServices: body.affectedServices ?? [],
    completedAt: null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
