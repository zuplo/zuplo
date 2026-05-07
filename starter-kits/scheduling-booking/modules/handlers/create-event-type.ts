import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { eventTypeRepository } from "../repositories/bookings.ts";

interface Body {
  slug: string;
  ownerEmail: string;
  name: string;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  locations?: string[];
  availableHours?: string;
  active?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await eventTypeRepository.create(tenantId, {
    slug: body.slug,
    ownerEmail: body.ownerEmail,
    name: body.name,
    durationMinutes: body.durationMinutes,
    bufferBeforeMinutes: body.bufferBeforeMinutes ?? 0,
    bufferAfterMinutes: body.bufferAfterMinutes ?? 0,
    locations: body.locations ?? [],
    availableHours: body.availableHours ?? "09:00-17:00",
    active: body.active ?? true,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
