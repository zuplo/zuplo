import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { showingRepository } from "../repositories/listings.ts";

interface Body {
  listingId: string;
  leadId: string;
  scheduledFor: string;
  durationMinutes?: number;
  agentEmail: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await showingRepository.create(tenantId, {
    listingId: body.listingId,
    leadId: body.leadId,
    scheduledFor: body.scheduledFor,
    durationMinutes: body.durationMinutes ?? 30,
    agentEmail: body.agentEmail,
    status: "scheduled",
    feedback: "",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
