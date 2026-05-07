import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { ticketRepository, type Ticket } from "../repositories/tickets.ts";

interface Body {
  subject?: string;
  body?: string;
  status?: Ticket["status"];
  priority?: Ticket["priority"];
  channel?: Ticket["channel"];
  assigneeEmail?: string | null;
  tags?: string[];
  slaBreachAt?: string | null;
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
