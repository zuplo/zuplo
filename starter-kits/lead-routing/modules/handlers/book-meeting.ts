import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { meetingBookingRepository } from "../repositories/meeting-bookings.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    leadId: string;
    repEmail: string;
    scheduledFor: string;
    kind?: "discovery" | "demo";
  };

  const created = await meetingBookingRepository.create(tenantId, {
    leadId: body.leadId,
    repEmail: body.repEmail,
    scheduledFor: body.scheduledFor,
    kind: body.kind ?? "discovery",
    status: "scheduled",
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
