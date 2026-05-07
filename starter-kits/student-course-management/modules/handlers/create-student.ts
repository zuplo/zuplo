import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  studentRepository,
  type Student,
} from "../repositories/students.ts";

interface Body {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  parentEmail?: string | null;
  gradeLevel: string;
  status?: Student["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await studentRepository.create(tenantId, {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    dateOfBirth: body.dateOfBirth,
    parentEmail: body.parentEmail ?? null,
    gradeLevel: body.gradeLevel,
    status: body.status ?? "active",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
