import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { prospectRepository } from "../repositories/prospects.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    firstName: string;
    lastName: string;
    email: string;
    company: string;
    title?: string;
  };

  const created = await prospectRepository.create(tenantId, {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    company: body.company,
    title: body.title ?? "",
    status: "new",
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
