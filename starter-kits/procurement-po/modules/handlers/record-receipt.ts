import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { purchaseOrderRepository } from "../repositories/purchase-orders.ts";
import { receiptRepository } from "../repositories/receipts.ts";

interface Body {
  poId: string;
  receivedBy: string;
  allItemsReceived: boolean;
  partialAmountCents?: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const po = await purchaseOrderRepository.get(tenantId, body.poId);
  if (!po) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Purchase order not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const receipt = await receiptRepository.create(tenantId, {
    poId: body.poId,
    receivedAt: new Date().toISOString(),
    receivedBy: body.receivedBy,
    allItemsReceived: body.allItemsReceived,
    partialAmountCents: body.partialAmountCents ?? null,
  });

  if (body.allItemsReceived) {
    try {
      await purchaseOrderRepository.update(tenantId, body.poId, { status: "received" });
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
  }

  return new Response(JSON.stringify(receipt), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
