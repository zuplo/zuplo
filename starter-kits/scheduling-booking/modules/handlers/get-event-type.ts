import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { eventTypeRepository } from "../repositories/bookings.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const eventType = await eventTypeRepository.get(tenantId, id);
  if (!eventType) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Event type not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(eventType), {
    headers: { "content-type": "application/json" },
  });
}
