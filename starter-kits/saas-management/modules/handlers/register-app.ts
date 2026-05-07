import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { saasAppRepository, type SaaSApp } from "../repositories/apps.ts";

interface Body {
  slug: string;
  name: string;
  vendor: string;
  category: string;
  owner: string;
  totalSeats: number;
  annualCostCents: number;
  renewalDate: string;
  status?: SaaSApp["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await saasAppRepository.create(tenantId, {
    slug: body.slug,
    name: body.name,
    vendor: body.vendor,
    category: body.category,
    owner: body.owner,
    totalSeats: body.totalSeats,
    activeSeats: 0,
    annualCostCents: body.annualCostCents,
    renewalDate: body.renewalDate,
    status: body.status ?? "active",
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
