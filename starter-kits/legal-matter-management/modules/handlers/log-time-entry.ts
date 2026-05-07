import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { matterTimeEntryRepository } from "../repositories/matters.ts";

interface Body {
  matterId: string;
  attorneyEmail: string;
  durationMinutes: number;
  narrative: string;
  performedAt: string;
  billable?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await matterTimeEntryRepository.create(tenantId, {
    matterId: body.matterId,
    attorneyEmail: body.attorneyEmail,
    durationMinutes: body.durationMinutes,
    narrative: body.narrative,
    billable: body.billable ?? true,
    performedAt: body.performedAt,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
