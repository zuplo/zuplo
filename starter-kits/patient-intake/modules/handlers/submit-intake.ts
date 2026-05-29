import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { intakeSubmissionRepository } from "../repositories/intake-submissions.ts";

interface Body {
  patientId: string;
  formId: string;
  payload: Record<string, unknown>;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await intakeSubmissionRepository.create(tenantId, {
    patientId: body.patientId,
    formId: body.formId,
    payload: body.payload,
    status: "received",
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
