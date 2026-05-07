import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { bookingRepository } from "../repositories/bookings.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const booking = await bookingRepository.get(tenantId, id);
  if (!booking) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Booking not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(booking), {
    headers: { "content-type": "application/json" },
  });
}
