import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import type { Account } from "../repositories/accounts.ts";
import { accountRepository } from "../repositories/accounts.ts";

interface Body {
  name: string;
  domain?: string;
  industry?: string;
  sizeBucket?: Account["sizeBucket"];
  ownerEmail: string;
  annualRevenueCents?: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const created = await accountRepository.create(tenantId, {
    name: body.name,
    domain: body.domain ?? null,
    industry: body.industry ?? null,
    sizeBucket: body.sizeBucket ?? "smb",
    ownerEmail: body.ownerEmail,
    annualRevenueCents: body.annualRevenueCents ?? null,
    createdAt: new Date().toISOString(),
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
