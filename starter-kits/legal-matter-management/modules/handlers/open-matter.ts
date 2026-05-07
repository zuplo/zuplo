import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { matterRepository, type Matter } from "../repositories/matters.ts";

interface Body {
  title: string;
  clientId: string;
  kind: Matter["kind"];
  leadAttorneyEmail: string;
  billingType: Matter["billingType"];
  description?: string;
  status?: Matter["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const created = await matterRepository.create(tenantId, {
    title: body.title,
    clientId: body.clientId,
    kind: body.kind,
    status: body.status ?? "open",
    openedAt: now,
    closedAt: null,
    leadAttorneyEmail: body.leadAttorneyEmail,
    billingType: body.billingType,
    description: body.description ?? "",
    createdAt: now,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
