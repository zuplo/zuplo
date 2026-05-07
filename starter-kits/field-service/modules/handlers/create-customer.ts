import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { customerRepository } from "../repositories/customers.ts";

interface Body {
  name: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  sites?: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await customerRepository.create(tenantId, {
    name: body.name,
    email: body.email ?? null,
    phone: body.phone ?? null,
    billingAddress: body.billingAddress ?? null,
    sites: body.sites ?? [],
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
