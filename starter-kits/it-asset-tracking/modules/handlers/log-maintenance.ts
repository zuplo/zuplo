import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { maintenanceRepository, type MaintenanceRecord } from "../repositories/assets.ts";

interface Body {
  assetId: string;
  kind: MaintenanceRecord["kind"];
  description: string;
  technicianEmail: string;
  costCents: number;
  performedAt?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const performedAt = body.performedAt ?? new Date().toISOString();

  const record = await maintenanceRepository.create(tenantId, {
    assetId: body.assetId,
    kind: body.kind,
    description: body.description,
    technicianEmail: body.technicianEmail,
    costCents: body.costCents,
    performedAt,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(record), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
