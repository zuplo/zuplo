import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { ticketRepository } from "../repositories/tickets.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const ticket = await ticketRepository.get(tenantId, id);
  if (!ticket) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Ticket not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(ticket), {
    headers: { "content-type": "application/json" },
  });
}
