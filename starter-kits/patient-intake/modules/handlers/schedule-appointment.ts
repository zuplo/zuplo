import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  appointmentRepository,
  type Appointment,
} from "../repositories/appointments.ts";

interface Body {
  patientId: string;
  providerEmail: string;
  scheduledFor: string;
  durationMinutes: number;
  kind: Appointment["kind"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await appointmentRepository.create(tenantId, {
    patientId: body.patientId,
    providerEmail: body.providerEmail,
    scheduledFor: body.scheduledFor,
    durationMinutes: body.durationMinutes,
    kind: body.kind,
    status: "scheduled",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
