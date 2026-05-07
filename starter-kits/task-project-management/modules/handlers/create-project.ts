import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { projectRepository } from "../repositories/projects.ts";

interface Body {
  slug: string;
  name: string;
  ownerEmail: string;
  startDate?: string | null;
  dueDate?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await projectRepository.create(tenantId, {
    slug: body.slug,
    name: body.name,
    ownerEmail: body.ownerEmail,
    status: "active",
    startDate: body.startDate ?? null,
    dueDate: body.dueDate ?? null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
