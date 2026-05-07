import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { clientRepository, type Client } from "../repositories/matters.ts";

interface Body {
  name: string;
  kind: Client["kind"];
  email: string;
  phone?: string;
  billingAddress?: string;
  conflicts?: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await clientRepository.create(tenantId, {
    name: body.name,
    kind: body.kind,
    email: body.email,
    phone: body.phone ?? "",
    billingAddress: body.billingAddress ?? "",
    conflicts: body.conflicts ?? [],
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
