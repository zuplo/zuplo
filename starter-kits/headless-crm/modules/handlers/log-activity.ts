import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import type { Activity } from "../repositories/activities.ts";
import { activityRepository } from "../repositories/activities.ts";

interface Body {
  kind: Activity["kind"];
  subject: string;
  body: string;
  dealId?: string;
  contactId?: string;
  accountId?: string;
  occurredAt?: string;
  ownerEmail: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const created = await activityRepository.create(tenantId, {
    kind: body.kind,
    subject: body.subject,
    body: body.body,
    dealId: body.dealId ?? null,
    contactId: body.contactId ?? null,
    accountId: body.accountId ?? null,
    occurredAt: body.occurredAt ?? new Date().toISOString(),
    ownerEmail: body.ownerEmail,
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
