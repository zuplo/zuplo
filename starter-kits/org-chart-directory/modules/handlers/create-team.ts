import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { teamRepository } from "../repositories/people.ts";

interface Body {
  name: string;
  leadEmail: string;
  parentTeamId?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await teamRepository.create(tenantId, {
    name: body.name,
    leadEmail: body.leadEmail,
    parentTeamId: body.parentTeamId ?? null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
