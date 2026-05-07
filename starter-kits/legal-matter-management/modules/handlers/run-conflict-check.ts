import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { conflictRepository, type Conflict } from "../repositories/matters.ts";

interface Body {
  matterId: string;
  candidateClientName: string;
  status?: Conflict["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await conflictRepository.create(tenantId, {
    matterId: body.matterId,
    candidateClientName: body.candidateClientName,
    status: body.status ?? "checked_clear",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
