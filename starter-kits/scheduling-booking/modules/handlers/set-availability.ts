import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { availabilityRepository } from "../repositories/bookings.ts";

interface Body {
  ownerEmail: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await availabilityRepository.create(tenantId, {
    ownerEmail: body.ownerEmail,
    dayOfWeek: body.dayOfWeek,
    startTime: body.startTime,
    endTime: body.endTime,
    timezone: body.timezone,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
