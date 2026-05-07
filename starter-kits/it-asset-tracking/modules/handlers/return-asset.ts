import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { assetRepository, assignmentRepository } from "../repositories/assets.ts";

interface Body {
  assignmentId: string;
  returnedAt?: string;
  returnCondition: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const returnedAt = body.returnedAt ?? new Date().toISOString();

  let updatedAssignment;
  try {
    updatedAssignment = await assignmentRepository.update(tenantId, body.assignmentId, {
      returnedAt,
      returnCondition: body.returnCondition,
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

  // Best-effort: flip the asset back to in_stock.
  try {
    await assetRepository.update(tenantId, updatedAssignment.assetId, {
      status: "in_stock",
    });
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }

  return new Response(JSON.stringify(updatedAssignment), {
    headers: { "content-type": "application/json" },
  });
}
