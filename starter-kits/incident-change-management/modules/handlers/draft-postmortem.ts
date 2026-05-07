import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { postmortemRepository } from "../repositories/incidents.ts";

interface Body {
  incidentId: string;
  content: string;
  actionItems?: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await postmortemRepository.create(tenantId, {
    incidentId: body.incidentId,
    content: body.content,
    status: "draft",
    actionItems: body.actionItems ?? [],
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
