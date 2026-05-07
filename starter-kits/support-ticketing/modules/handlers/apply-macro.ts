import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { conversationRepository, macroRepository, ticketRepository } from "../repositories/tickets.ts";

interface Body {
  ticketId: string;
  macroId: string;
  authorEmail?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const macro = await macroRepository.get(tenantId, body.macroId);
  if (!macro) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Macro not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const ticket = await ticketRepository.get(tenantId, body.ticketId);
  if (!ticket) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Ticket not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const now = new Date().toISOString();
  const conversation = await conversationRepository.create(tenantId, {
    ticketId: body.ticketId,
    kind: "public",
    authorEmail: body.authorEmail ?? ticket.assigneeEmail ?? "support@example.com",
    body: macro.body,
    sentAt: now,
    createdAt: now,
  });

  return new Response(
    JSON.stringify({ macro, conversation }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
