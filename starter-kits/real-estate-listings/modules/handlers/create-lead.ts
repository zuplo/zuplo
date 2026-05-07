import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { leadRepository, type Lead } from "../repositories/listings.ts";

interface Body {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  source?: string;
  agentEmail: string;
  budgetCents?: number | null;
  areaInterest?: string;
  bedroomsMin?: number | null;
  status?: Lead["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const created = await leadRepository.create(tenantId, {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone ?? "",
    source: body.source ?? "manual",
    status: body.status ?? "new",
    agentEmail: body.agentEmail,
    budgetCents: body.budgetCents ?? null,
    areaInterest: body.areaInterest ?? "",
    bedroomsMin: body.bedroomsMin ?? null,
    addedAt: now,
    createdAt: now,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
