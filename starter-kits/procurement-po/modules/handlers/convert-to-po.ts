import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { purchaseRequestRepository } from "../repositories/purchase-requests.ts";
import { purchaseOrderRepository } from "../repositories/purchase-orders.ts";

interface Body {
  poNumber?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = ((await request.json().catch(() => ({}))) as Body) ?? {};

  const pr = await purchaseRequestRepository.get(tenantId, id);
  if (!pr) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Purchase request not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  if (pr.status !== "approved") {
    return new Response(
      JSON.stringify({ error: { type: "invalid_state", message: "Purchase request must be approved before issuing a PO." } }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }

  const po = await purchaseOrderRepository.create(tenantId, {
    purchaseRequestId: pr.id,
    vendorId: pr.vendorId,
    poNumber: body.poNumber ?? `PO-${Date.now()}`,
    totalCents: pr.totalCents,
    currency: pr.currency,
    status: "issued",
    issuedAt: new Date().toISOString(),
  });

  try {
    await purchaseRequestRepository.update(tenantId, pr.id, { status: "converted_to_po" });
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }

  return new Response(JSON.stringify(po), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
