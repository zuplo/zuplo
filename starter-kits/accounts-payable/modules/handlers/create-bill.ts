import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { billRepository } from "../repositories/bills.ts";

interface Body {
  vendorId: string;
  billNumber: string;
  amountCents: number;
  currency: string;
  dueDate: string;
  glCode: string;
  poNumber?: string | null;
  attachmentUrl?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await billRepository.create(tenantId, {
    vendorId: body.vendorId,
    billNumber: body.billNumber,
    amountCents: body.amountCents,
    currency: body.currency,
    dueDate: body.dueDate,
    status: "draft",
    glCode: body.glCode,
    poNumber: body.poNumber ?? null,
    attachmentUrl: body.attachmentUrl ?? null,
    approverEmail: null,
    approvedAt: null,
    paidAt: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
