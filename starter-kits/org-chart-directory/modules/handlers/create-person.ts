import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { personRepository, type Person } from "../repositories/people.ts";

interface Body {
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  department: string;
  managerEmail?: string | null;
  location: string;
  startDate: string;
  status?: Person["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await personRepository.create(tenantId, {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    title: body.title,
    department: body.department,
    managerEmail: body.managerEmail ?? null,
    location: body.location,
    startDate: body.startDate,
    status: body.status ?? "active",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
