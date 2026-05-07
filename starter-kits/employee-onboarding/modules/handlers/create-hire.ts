import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { hireRepository } from "../repositories/hires.ts";

interface Body {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  startDate: string;
  managerEmail: string;
  buddyEmail?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await hireRepository.create(tenantId, {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    role: body.role,
    startDate: body.startDate,
    managerEmail: body.managerEmail,
    buddyEmail: body.buddyEmail ?? null,
    status: "pre_start",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
