import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { billRepository, billApprovalRepository } from "../repositories/bills.ts";

interface Body {
  approverEmail: string;
  reason: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;

  const now = new Date().toISOString();
  await billApprovalRepository.create(tenantId, {
    billId: id,
    approverEmail: body.approverEmail,
    decision: "rejected",
    reason: body.reason,
    decidedAt: now,
    createdAt: now,
  });

  try {
    const updated = await billRepository.update(tenantId, id, {
      status: "void",
    });
    return new Response(JSON.stringify(updated), {
      headers: { "content-type": "application/json" },
    });
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
