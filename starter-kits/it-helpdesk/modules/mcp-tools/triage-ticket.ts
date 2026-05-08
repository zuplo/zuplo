import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import { categoryRepository } from "../repositories/tickets.ts";
import type { IncidentTicket } from "../repositories/tickets.ts";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { callClaudeJson } from "../integrations/claude.ts";

/**
 * Orchestrator: triage_ticket.
 *
 * Asks Claude to classify category + priority for an inbound IT helpdesk
 * ticket, then resolves the recommended assignee from the matching category's
 * default owner.
 */

interface Body {
  ticketId: string;
}

interface ClaudeTriage {
  category: "hardware" | "software" | "access" | "network" | "other";
  priority: "low" | "med" | "high" | "critical";
  reasoning: string;
}

const SYSTEM_PROMPT = `You are an internal IT helpdesk triage agent.

Classify the ticket. Return JSON with:
- category: one of hardware | software | access | network | other
- priority: one of low | med | high | critical
- reasoning: one short sentence explaining the priority

Treat outage / "everyone is affected" / production-impact wording as critical.
Treat "blocked" / "can't work" / VIP requestor wording as at least high.
Default to med when unsure.`;

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.ticketId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "ticketId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const tenantId = requireTenant(request);
  const auth = request.headers.get("authorization") ?? "";

  const ticket = await invokeJson<IncidentTicket>(
    context,
    `/tickets/${encodeURIComponent(body.ticketId)}`,
    { headers: { authorization: auth } },
  );

  const triage = await callClaudeJson<ClaudeTriage>({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          `Subject: ${ticket.subject}`,
          `Requester: ${ticket.requesterEmail}`,
          "",
          ticket.body,
        ].join("\n"),
      },
    ],
    maxTokens: 512,
    jsonSchemaHint: `{
  "category": "hardware|software|access|network|other",
  "priority": "low|med|high|critical",
  "reasoning": "string"
}`,
  });

  // Resolve the default assignee for the suggested category from the tenant's
  // own category map.
  let suggestedAssignee: string | null = null;
  let categoryCursor: string | null | undefined;
  do {
    const page = await categoryRepository.list(tenantId, {
      limit: 200,
      cursor: categoryCursor ?? undefined,
    });
    const match = page.items.find((c) => c.slug === triage.category);
    if (match) {
      suggestedAssignee = match.defaultAssigneeEmail ?? null;
      break;
    }
    categoryCursor = page.nextCursor;
  } while (categoryCursor);

  return new Response(
    JSON.stringify({
      ticketId: ticket.id,
      suggestedCategory: triage.category,
      suggestedPriority: triage.priority,
      suggestedAssignee,
      reasoning: triage.reasoning,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
