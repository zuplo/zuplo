import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { enrollmentRepository } from "../repositories/enrollments.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    prospectId: string;
    cadenceId: string;
    repEmail: string;
  };

  const now = new Date().toISOString();
  const created = await enrollmentRepository.create(tenantId, {
    prospectId: body.prospectId,
    cadenceId: body.cadenceId,
    repEmail: body.repEmail,
    status: "active",
    currentStep: 0,
    startedAt: now,
    lastActivityAt: now,
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
