import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  patientRepository,
  type Patient,
} from "../repositories/patients.ts";

interface Body {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  mrn: string;
  address: string;
  primaryProviderEmail?: string | null;
  status?: Patient["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await patientRepository.create(tenantId, {
    firstName: body.firstName,
    lastName: body.lastName,
    dateOfBirth: body.dateOfBirth,
    email: body.email,
    phone: body.phone,
    mrn: body.mrn,
    address: body.address,
    primaryProviderEmail: body.primaryProviderEmail ?? null,
    status: body.status ?? "active",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
