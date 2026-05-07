import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { contactRepository } from "../repositories/contacts.ts";

interface Body {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  title?: string;
  accountId: string;
  ownerEmail: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const created = await contactRepository.create(tenantId, {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone ?? null,
    title: body.title ?? null,
    accountId: body.accountId,
    ownerEmail: body.ownerEmail,
    createdAt: new Date().toISOString(),
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
