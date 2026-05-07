import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { jobRepository, type Job } from "../repositories/jobs.ts";

interface Body {
  customerId: string;
  technicianEmail: string;
  kind: Job["kind"];
  scheduledFor: string;
  durationMinutes?: number;
  siteAddress: string;
  description?: string;
  totalCents?: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await jobRepository.create(tenantId, {
    customerId: body.customerId,
    technicianEmail: body.technicianEmail,
    kind: body.kind,
    scheduledFor: body.scheduledFor,
    durationMinutes: body.durationMinutes ?? 60,
    status: "scheduled",
    siteAddress: body.siteAddress,
    description: body.description ?? null,
    totalCents: body.totalCents ?? 0,
    paidCents: 0,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
