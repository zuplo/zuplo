import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { customerRepository } from "../repositories/invoices.ts";

interface Body {
  name: string;
  email: string;
  billingAddress: string;
  currency: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await customerRepository.create(tenantId, {
    name: body.name,
    email: body.email,
    billingAddress: body.billingAddress,
    currency: body.currency,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
