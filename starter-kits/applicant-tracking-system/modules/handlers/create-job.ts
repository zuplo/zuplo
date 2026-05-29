import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { jobRepository } from "../repositories/jobs.ts";

interface Body {
  title: string;
  department: string;
  location: string;
  requisitionId: string;
  description: string;
  status?: "open" | "closed";
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await jobRepository.create(tenantId, {
    title: body.title,
    department: body.department,
    location: body.location,
    requisitionId: body.requisitionId,
    description: body.description,
    status: body.status ?? "open",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
