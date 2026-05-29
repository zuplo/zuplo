import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { reservationRepository, type Reservation } from "../repositories/reservations.ts";

interface Body {
  guestId: string;
  scheduledFor: string;
  partySize: number;
  durationMinutes?: number;
  tableId?: string;
  specialRequests?: string;
  source?: Reservation["source"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const now = new Date().toISOString();
  const created = await reservationRepository.create(tenantId, {
    guestId: body.guestId,
    scheduledFor: body.scheduledFor,
    partySize: body.partySize,
    durationMinutes: body.durationMinutes ?? 90,
    tableId: body.tableId ?? null,
    status: "confirmed",
    specialRequests: body.specialRequests ?? null,
    source: body.source ?? "web",
    confirmedAt: now,
    seatedAt: null,
    completedAt: null,
    createdAt: now,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
