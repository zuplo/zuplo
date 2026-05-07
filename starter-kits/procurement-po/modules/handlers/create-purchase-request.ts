import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { purchaseRequestRepository } from "../repositories/purchase-requests.ts";

interface Body {
  requesterEmail: string;
  vendorId: string;
  totalCents: number;
  currency: string;
  costCenter: string;
  justification: string;
  rush?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const created = await purchaseRequestRepository.create(tenantId, {
    requesterEmail: body.requesterEmail,
    vendorId: body.vendorId,
    totalCents: body.totalCents,
    currency: body.currency,
    costCenter: body.costCenter,
    justification: body.justification,
    status: "draft",
    approverEmail: null,
    approvedAt: null,
    rush: body.rush ?? false,
    createdAt: new Date().toISOString(),
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
