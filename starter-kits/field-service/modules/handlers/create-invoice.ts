import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { jobInvoiceRepository } from "../repositories/job-invoices.ts";

interface Body {
  jobId: string;
  totalCents: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await jobInvoiceRepository.create(tenantId, {
    jobId: body.jobId,
    totalCents: body.totalCents,
    status: "draft",
    sentAt: null,
    paidAt: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
