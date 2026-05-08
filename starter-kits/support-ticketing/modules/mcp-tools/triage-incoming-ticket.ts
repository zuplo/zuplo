import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Ticket } from "../repositories/tickets.ts";
import { callClaudeJson } from "../integrations/claude.ts";

/**
 * Orchestrator MCP tool: triage_incoming_ticket.
 *
 * Pulls a ticket, asks Claude to classify category + severity and draft a
 * suggested first reply, then optionally cross-references recent tickets in
 * the same tenant to recommend the assignee who has handled similar tagged
 * tickets most often.
 *
 * The LLM does the work; the gateway grounds the LLM with real tenant data
 * via invokeRoute (auth + rate-limit + tenant scoping inherited).
 */

interface Body {
  ticketId: string;
  /** When true, also returns a draft reply suitable for sending to the customer. */
  draftReply?: boolean;
}

interface TicketPage {
  items: Ticket[];
  nextCursor: string | null;
}

interface ClaudeTriage {
  category: string;
  tags: string[];
  priority: "low" | "normal" | "high" | "urgent";
  reasoning: string;
  draftReply?: string;
}

const SYSTEM_PROMPT = `You are a senior customer support triage agent.

You will be given a single inbound support ticket. Classify it and propose:
- a single category (one of: billing, auth, bug, feature, performance, onboarding, other)
- 0-4 short tags (lowercase, hyphenated, reused from the ticket text where possible)
- a priority (low | normal | high | urgent) based on customer impact and language
- a one-sentence reasoning for the priority
- optionally, a draft first reply to the customer (friendly, signed "the support team", no commitments on timeline)

Treat anything mentioning "down", "outage", "data loss", "security", "breach", or "refund" as at least high priority.`;

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.ticketId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "ticketId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const ticket = await invokeJson<Ticket>(
    context,
    `/tickets/${encodeURIComponent(body.ticketId)}`,
    { headers: auth },
  );

  // Ask Claude to classify + draft a suggested reply.
  const triage = await callClaudeJson<ClaudeTriage>({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          `Subject: ${ticket.subject}`,
          `Customer: ${ticket.customerEmail}`,
          `Channel: ${ticket.channel}`,
          "",
          ticket.body,
          "",
          body.draftReply
            ? "Include the `draftReply` field."
            : "Do not include `draftReply`.",
        ].join("\n"),
      },
    ],
    maxTokens: 1024,
    jsonSchemaHint: `{
  "category": "string",
  "tags": ["string"],
  "priority": "low|normal|high|urgent",
  "reasoning": "string",
  "draftReply": "string (optional)"
}`,
  });

  // Cross-reference recent tickets to find the most likely assignee for these tags.
  const recent = await invokeJson<TicketPage>(context, "/tickets?limit=200", {
    headers: auth,
  });
  const tagCounts: Record<string, Record<string, number>> = {};
  for (const t of recent.items) {
    if (!t.assigneeEmail) continue;
    for (const tag of t.tags ?? []) {
      if (!triage.tags.includes(tag)) continue;
      tagCounts[tag] ??= {};
      tagCounts[tag][t.assigneeEmail] = (tagCounts[tag][t.assigneeEmail] ?? 0) + 1;
    }
  }
  const assigneeScores: Record<string, number> = {};
  for (const tag of triage.tags) {
    for (const [email, count] of Object.entries(tagCounts[tag] ?? {})) {
      assigneeScores[email] = (assigneeScores[email] ?? 0) + count;
    }
  }
  let suggestedAssignee: string | null = null;
  let bestScore = 0;
  for (const [email, score] of Object.entries(assigneeScores)) {
    if (score > bestScore) {
      bestScore = score;
      suggestedAssignee = email;
    }
  }

  const similarTickets = recent.items
    .filter((t) => t.id !== ticket.id)
    .filter((t) => (t.tags ?? []).some((tag) => triage.tags.includes(tag)))
    .slice(0, 5);

  return new Response(
    JSON.stringify({
      ticketId: ticket.id,
      category: triage.category,
      suggestedTags: triage.tags,
      suggestedPriority: triage.priority,
      suggestedAssignee,
      reasoning: triage.reasoning,
      draftReply: triage.draftReply ?? null,
      similarTickets,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
