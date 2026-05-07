import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  interviewRepository,
  type Interview,
} from "../repositories/interviews.ts";

interface Body {
  applicationId: string;
  scheduledAt: string;
  kind: Interview["kind"];
  interviewerEmail: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await interviewRepository.create(tenantId, {
    applicationId: body.applicationId,
    scheduledAt: body.scheduledAt,
    kind: body.kind,
    interviewerEmail: body.interviewerEmail,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
