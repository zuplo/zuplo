import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import { conversationRepository, customerRepository } from "../repositories/tickets.ts";
import type { Conversation, Customer, Ticket } from "../repositories/tickets.ts";
import { requireTenant } from "../_shared/auth/index.ts";

/**
 * Orchestrator: escalate_with_summary.
 *
 * Pulls the ticket, every conversation on it, and any matching customer
 * record, and builds a chronological summary string suitable for handing
 * off to a senior agent or another team. The agent (or human) decides
 * what to do with the summary.
 */

interface Body {
  ticketId: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.ticketId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "ticketId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const tenantId = requireTenant(request);
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const ticket = await invokeJson<Ticket>(
    context,
    `/tickets/${encodeURIComponent(body.ticketId)}`,
    { headers: auth },
  );

  // Pull all conversations for this ticket. /conversations isn't exposed on
  // the public API surface so we read the repository directly (still tenant-
  // scoped — the repository requires tenantId).
  const conversations: Conversation[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await conversationRepository.list(tenantId, {
      limit: 200,
      cursor: cursor ?? undefined,
      orderBy: { field: "sentAt", direction: "asc" },
    });
    for (const c of page.items) {
      if (c.ticketId === ticket.id) conversations.push(c);
    }
    cursor = page.nextCursor;
    if (conversations.length > 500) break;
  } while (cursor);

  // Find matching customer by email.
  let customer: Customer | null = null;
  let cCursor: string | null | undefined;
  do {
    const page = await customerRepository.list(tenantId, {
      limit: 200,
      cursor: cCursor ?? undefined,
    });
    const match = page.items.find((c) => c.email === ticket.customerEmail);
    if (match) {
      customer = match;
      break;
    }
    cCursor = page.nextCursor;
  } while (cCursor);

  // Build a chronological text summary.
  const customerLine = customer
    ? `${customer.name} <${customer.email}> on plan ${customer.plan} (account ${customer.accountId})`
    : `${ticket.customerEmail} (no customer record found)`;

  const lines: string[] = [
    `# Escalation summary for ticket ${ticket.id}`,
    `Subject: ${ticket.subject}`,
    `Customer: ${customerLine}`,
    `Status: ${ticket.status}, priority: ${ticket.priority}, channel: ${ticket.channel}`,
    `Opened: ${ticket.openedAt}${ticket.assigneeEmail ? `, assigned to ${ticket.assigneeEmail}` : ", unassigned"}`,
    `Tags: ${(ticket.tags ?? []).join(", ") || "(none)"}`,
    "",
    "## Original message",
    ticket.body,
    "",
    "## Conversation history",
  ];

  for (const c of conversations) {
    const tag = c.kind === "internal" ? "[internal]" : "";
    lines.push(`- ${c.sentAt} ${c.authorEmail} ${tag}: ${c.body}`);
  }

  if (conversations.length === 0) {
    lines.push("(no replies yet)");
  }

  return new Response(
    JSON.stringify({
      ticketId: ticket.id,
      ticket,
      customer,
      conversationCount: conversations.length,
      summaryText: lines.join("\n"),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
