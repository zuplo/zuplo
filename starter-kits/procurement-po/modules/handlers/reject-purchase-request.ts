import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { purchaseRequestRepository } from "../repositories/purchase-requests.ts";

interface Body {
  approverEmail: string;
  reason?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;
  try {
    const updated = await purchaseRequestRepository.update(tenantId, id, {
      status: "rejected",
      approverEmail: body.approverEmail,
      approvedAt: new Date().toISOString(),
    });
    return new Response(JSON.stringify(updated), { headers: { "content-type": "application/json" } });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: err.message } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }
}
