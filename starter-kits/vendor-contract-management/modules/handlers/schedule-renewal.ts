import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { renewalRepository, type Renewal } from "../repositories/contracts.ts";

interface Body {
  contractId: string;
  dueDate: string;
  action: Renewal["action"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await renewalRepository.create(tenantId, {
    contractId: body.contractId,
    dueDate: body.dueDate,
    action: body.action,
    status: "upcoming",
    outcome: null,
    completedAt: null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
