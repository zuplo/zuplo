import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { negotiationRepository, type Negotiation } from "../repositories/negotiations.ts";

interface Body {
  renewalId: string;
  kind: Negotiation["kind"];
  proposal: string;
  status?: Negotiation["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const status = body.status ?? "open";
  const created = await negotiationRepository.create(tenantId, {
    renewalId: body.renewalId,
    kind: body.kind,
    proposal: body.proposal,
    status,
    decidedAt: status === "open" ? null : new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
