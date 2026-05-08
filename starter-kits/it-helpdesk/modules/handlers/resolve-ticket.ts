import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { ticketRepository } from "../repositories/tickets.ts";
import { sendResendEmail } from "../integrations/resend.ts";

interface Body {
  resolutionSummary?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json().catch(() => ({}))) as Body;

  let updated;
  try {
    updated = await ticketRepository.update(tenantId, id, {
      status: "resolved",
      resolvedAt: new Date().toISOString(),
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

  // Email the requester to confirm resolution. Failures don't fail the
  // resolution itself — the ticket state is the source of truth.
  try {
    await sendResendEmail({
      to: updated.requesterEmail,
      subject: `[Resolved] ${updated.subject}`,
      text: [
        `Your IT helpdesk ticket has been marked resolved.`,
        body.resolutionSummary ? `\nResolution summary:\n${body.resolutionSummary}` : "",
        `\nIf this isn't fixed, reply to this email and we'll reopen the ticket.`,
        `\nTicket id: ${updated.id}`,
      ].join("\n"),
      tags: [
        { name: "ticket_id", value: updated.id },
        { name: "tenant_id", value: tenantId },
      ],
    });
  } catch (err) {
    context.log.warn(
      `Resend send failed for resolved ticket ${updated.id}: ${(err as Error).message}`,
    );
  }

  return new Response(JSON.stringify(updated), {
    headers: { "content-type": "application/json" },
  });
}
