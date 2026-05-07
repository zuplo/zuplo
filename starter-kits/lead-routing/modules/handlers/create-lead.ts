import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { leadRepository } from "../repositories/leads.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    firstName: string;
    lastName: string;
    email: string;
    company: string;
    title?: string;
    phone?: string;
    source?: string;
    score?: number;
  };

  const created = await leadRepository.create(tenantId, {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    company: body.company,
    title: body.title ?? "",
    phone: body.phone ?? "",
    source: body.source ?? "unknown",
    status: "new",
    assignedTo: null,
    assignedAt: null,
    score: body.score ?? 0,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
