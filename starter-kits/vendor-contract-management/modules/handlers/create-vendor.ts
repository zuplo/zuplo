import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { vendorRepository, type Vendor } from "../repositories/contracts.ts";

interface Body {
  name: string;
  contactEmail: string;
  website?: string | null;
  category: string;
  status?: Vendor["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await vendorRepository.create(tenantId, {
    name: body.name,
    contactEmail: body.contactEmail,
    website: body.website ?? null,
    category: body.category,
    totalSpendCents: 0,
    status: body.status ?? "active",
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
