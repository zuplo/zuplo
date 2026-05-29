import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { campaignRepository } from "../repositories/campaigns.ts";

interface Body {
  name: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  segmentId?: string;
  templateId?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await campaignRepository.create(tenantId, {
    name: body.name,
    subject: body.subject,
    fromName: body.fromName,
    fromEmail: body.fromEmail,
    status: "draft",
    scheduledFor: null,
    sentAt: null,
    segmentId: body.segmentId ?? null,
    templateId: body.templateId ?? null,
    openCount: 0,
    clickCount: 0,
    bounceCount: 0,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
