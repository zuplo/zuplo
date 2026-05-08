import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { ticketRepository } from "../repositories/tickets.ts";
import {
  verifyPostmarkWebhook,
  type PostmarkInboundEmail,
} from "../integrations/postmark.ts";

/**
 * Postmark inbound email webhook → ticket.
 *
 * Postmark posts a parsed JSON object representing the inbound email. We:
 *   1. Verify the request via HTTP Basic Auth (configured on the Postmark
 *      side under Server Settings > Inbound).
 *   2. Map From/Subject/TextBody/HtmlBody onto a Ticket and create it.
 *   3. Return 200 quickly so Postmark doesn't retry.
 *
 * Triage runs out of band — call `triage_incoming_ticket` with the ticket id
 * (e.g. via your MCP client, an orchestrator, or a follow-up handler).
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  // The webhook itself doesn't carry an API key — the Postmark Basic Auth
  // header is the authn boundary. The tenant is resolved via the request user
  // metadata when the webhook URL itself is signed/scoped per-tenant; in this
  // template we expect the api-key-inbound policy to map the per-tenant
  // webhook key to a tenantId on `request.user`.
  if (!verifyPostmarkWebhook(request)) {
    return new Response(
      JSON.stringify({ error: { type: "unauthorized", message: "invalid Postmark credentials" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  const tenantId = requireTenant(request);
  const inbound = (await request.json()) as PostmarkInboundEmail;

  const fromEmail = inbound.FromFull?.Email ?? inbound.From;
  const subject = inbound.Subject || "(no subject)";
  const replyText =
    inbound.StrippedTextReply || inbound.TextBody || inbound.HtmlBody || "";

  const now = new Date().toISOString();
  const ticket = await ticketRepository.create(tenantId, {
    customerEmail: fromEmail,
    subject,
    body: replyText,
    status: "new",
    priority: "normal",
    channel: "email",
    assigneeEmail: null,
    tags: [],
    slaBreachAt: null,
    openedAt: now,
    resolvedAt: null,
    createdAt: now,
  });

  context.log.info(
    `Postmark inbound: ticket ${ticket.id} created from ${fromEmail} (Postmark MessageID=${inbound.MessageID})`,
  );

  return new Response(
    JSON.stringify({ ok: true, ticketId: ticket.id }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
