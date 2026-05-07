import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { vendorRepository, type Vendor } from "../repositories/bills.ts";

interface Body {
  name: string;
  email: string;
  paymentTerms: number;
  currency: string;
  paymentMethod: Vendor["paymentMethod"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await vendorRepository.create(tenantId, {
    name: body.name,
    email: body.email,
    paymentTerms: body.paymentTerms,
    currency: body.currency,
    paymentMethod: body.paymentMethod,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
