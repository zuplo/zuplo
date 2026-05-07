import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { conversationRepository, ticketRepository, type Conversation } from "../repositories/tickets.ts";

interface Body {
  authorEmail: string;
  body: string;
  kind?: Conversation["kind"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const ticketId = request.params.id;
  const body = (await request.json()) as Body;

  // Confirm ticket exists in this tenant before logging the reply.
  const ticket = await ticketRepository.get(tenantId, ticketId);
  if (!ticket) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Ticket not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const now = new Date().toISOString();
  const conversation = await conversationRepository.create(tenantId, {
    ticketId,
    kind: body.kind ?? "public",
    authorEmail: body.authorEmail,
    body: body.body,
    sentAt: now,
    createdAt: now,
  });

  // Public replies move the ticket to `pending` (waiting on the customer).
  if ((body.kind ?? "public") === "public" && ticket.status !== "closed") {
    try {
      await ticketRepository.update(tenantId, ticketId, { status: "pending" });
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
  }

  return new Response(JSON.stringify(conversation), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
