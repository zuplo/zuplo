import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { guestRepository } from "../repositories/guests.ts";

interface Body {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  vip?: boolean;
  allergies?: string[];
  preferences?: string;
  notes?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await guestRepository.create(tenantId, {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email ?? null,
    phone: body.phone ?? null,
    totalVisits: 0,
    lastVisitAt: null,
    vip: body.vip ?? false,
    allergies: body.allergies ?? [],
    preferences: body.preferences ?? null,
    notes: body.notes ?? null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
