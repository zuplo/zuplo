import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import type { Donor } from "../repositories/donors.ts";
import { donorRepository } from "../repositories/donors.ts";

interface Body {
  firstName: string;
  lastName: string;
  email: string;
  mailingAddress?: string;
  donorType?: Donor["donorType"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const created = await donorRepository.create(tenantId, {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    mailingAddress: body.mailingAddress ?? null,
    donorType: body.donorType ?? "individual",
    lifetimeGivingCents: 0,
    lastGiftDate: null,
    giftCount: 0,
    status: "active",
    createdAt: new Date().toISOString(),
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
