import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { webhookRepository } from "../repositories/webhooks.ts";

interface Body {
  formId: string;
  url: string;
  secret?: string;
  active?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await webhookRepository.create(tenantId, {
    formId: body.formId,
    url: body.url,
    secret: body.secret ?? "",
    active: body.active ?? true,
    lastDeliveredAt: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
