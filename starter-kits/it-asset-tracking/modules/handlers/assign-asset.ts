import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { assetRepository, assignmentRepository } from "../repositories/assets.ts";

interface Body {
  assetId: string;
  employeeEmail: string;
  assignedAt?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const assignedAt = body.assignedAt ?? new Date().toISOString();

  const assignment = await assignmentRepository.create(tenantId, {
    assetId: body.assetId,
    employeeEmail: body.employeeEmail,
    assignedAt,
    returnedAt: null,
    returnCondition: null,
    createdAt: new Date().toISOString(),
  });

  // Best-effort: flip the asset to assigned. Real implementations should
  // verify the asset is in_stock first and reject the assignment if not.
  try {
    await assetRepository.update(tenantId, body.assetId, { status: "assigned" });
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }

  return new Response(JSON.stringify(assignment), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
