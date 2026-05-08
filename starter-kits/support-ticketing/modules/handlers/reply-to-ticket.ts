import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import {
  conversationRepository,
  ticketRepository,
  type Conversation,
} from "../repositories/tickets.ts";
import { sendResendEmail } from "../integrations/resend.ts";

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

  const isPublic = (body.kind ?? "public") === "public";

  // Public replies move the ticket to `pending` (waiting on the customer).
  if (isPublic && ticket.status !== "closed") {
    try {
      await ticketRepository.update(tenantId, ticketId, { status: "pending" });
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
  }

  // Send the public reply to the customer via Resend. Skipped for internal
  // notes. Email failures are logged but do not fail the request — the
  // conversation entry is the source of truth.
  let emailMessageId: string | null = null;
  if (isPublic) {
    try {
      const sent = await sendResendEmail({
        to: ticket.customerEmail,
        subject: `Re: ${ticket.subject}`,
        text: body.body,
        replyTo: body.authorEmail,
        tags: [
          { name: "ticket_id", value: ticket.id },
          { name: "tenant_id", value: tenantId },
        ],
      });
      emailMessageId = sent.id;
    } catch (err) {
      context.log.warn(
        `Resend send failed for ticket ${ticket.id}: ${(err as Error).message}`,
      );
    }
  }

  return new Response(
    JSON.stringify({ ...conversation, emailMessageId }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
