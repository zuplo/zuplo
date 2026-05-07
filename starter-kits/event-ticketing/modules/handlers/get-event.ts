import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { eventRepository } from "../repositories/events.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const event = await eventRepository.get(tenantId, id);
  if (!event) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Event not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(event), {
    headers: { "content-type": "application/json" },
  });
}
