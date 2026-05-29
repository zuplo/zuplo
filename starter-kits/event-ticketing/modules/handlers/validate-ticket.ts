import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { ticketRepository } from "../repositories/tickets.ts";

/**
 * Read-only validation: returns whether a ticket is currently valid (not voided
 * and not already checked in). Does NOT mutate the ticket.
 */
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

  return new Response(
    JSON.stringify({
      ticketId: ticket.id,
      valid: ticket.status === "valid",
      status: ticket.status,
      reason:
        ticket.status === "voided"
          ? "Ticket has been voided"
          : ticket.status === "checked_in"
            ? "Ticket already checked in"
            : null,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
