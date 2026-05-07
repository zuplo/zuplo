import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { ticketRepository, type IncidentTicket } from "../repositories/tickets.ts";

interface Body {
  subject?: string;
  body?: string;
  category?: IncidentTicket["category"];
  priority?: IncidentTicket["priority"];
  status?: IncidentTicket["status"];
  assigneeEmail?: string | null;
  tags?: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const patch = (await request.json()) as Body;

  try {
    const updated = await ticketRepository.update(tenantId, id, patch);
    return new Response(JSON.stringify(updated), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: err.message } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }
}
