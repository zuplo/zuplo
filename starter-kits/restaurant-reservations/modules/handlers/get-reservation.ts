import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { reservationRepository } from "../repositories/reservations.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const reservation = await reservationRepository.get(tenantId, id);
  if (!reservation) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Reservation not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(reservation), {
    headers: { "content-type": "application/json" },
  });
}
