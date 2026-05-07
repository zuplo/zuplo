import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Ticket } from "../repositories/tickets.ts";

/**
 * Orchestrator: triage_incoming_ticket.
 *
 * Reads a freshly-created ticket and suggests a priority, tags, and assignee
 * based on keyword heuristics in the subject + body. Optionally looks at
 * recent tickets in the same tenant to find common assignees for similar tags.
 */

interface Body {
  ticketId: string;
}

interface TicketPage {
  items: Ticket[];
  nextCursor: string | null;
}

const PRIORITY_KEYWORDS: Record<Ticket["priority"], string[]> = {
  urgent: ["down", "outage", "production", "cannot login", "data loss", "security", "breach"],
  high: ["asap", "blocked", "important", "deadline", "customer churn", "refund", "billing"],
  normal: [],
  low: ["minor", "whenever", "no rush", "nice to have", "feature request"],
};

const TAG_KEYWORDS: Record<string, string[]> = {
  billing: ["bill", "invoice", "charge", "refund", "subscription", "payment"],
  auth: ["login", "password", "sso", "mfa", "2fa", "locked", "session"],
  bug: ["bug", "error", "crash", "broken", "fails", "doesn't work", "exception"],
  feature: ["feature", "request", "would love", "could you add", "enhancement"],
  performance: ["slow", "lag", "timeout", "performance", "spinning", "hang"],
  onboarding: ["getting started", "set up", "first time", "onboarding", "configure"],
};

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

  const haystack = `${ticket.subject} ${ticket.body}`.toLowerCase();

  // Priority: pick the highest priority that matches; fall back to normal.
  let suggestedPriority: Ticket["priority"] = "normal";
  const order: Ticket["priority"][] = ["urgent", "high", "normal", "low"];
  for (const prio of order) {
    if (PRIORITY_KEYWORDS[prio].some((kw) => haystack.includes(kw))) {
      suggestedPriority = prio;
      break;
    }
  }

  // Tags: collect all matching keyword categories.
  const suggestedTags: string[] = [];
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some((kw) => haystack.includes(kw))) {
      suggestedTags.push(tag);
    }
  }

  // Suggest an assignee based on recent tickets sharing any tag.
  const recent = await invokeJson<TicketPage>(context, "/tickets?limit=200", { headers: auth });
  const tagCounts: Record<string, Record<string, number>> = {};
  for (const t of recent.items) {
    if (!t.assigneeEmail) continue;
    for (const tag of t.tags ?? []) {
      if (!suggestedTags.includes(tag)) continue;
      tagCounts[tag] ??= {};
      tagCounts[tag][t.assigneeEmail] = (tagCounts[tag][t.assigneeEmail] ?? 0) + 1;
    }
  }
  const assigneeScores: Record<string, number> = {};
  for (const tag of suggestedTags) {
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

  // Pull a short list of recent similar tickets for context.
  const similarTickets = recent.items
    .filter((t) => t.id !== ticket.id)
    .filter((t) => (t.tags ?? []).some((tag) => suggestedTags.includes(tag)))
    .slice(0, 5);

  return new Response(
    JSON.stringify({
      ticketId: ticket.id,
      suggestedPriority,
      suggestedTags,
      suggestedAssignee,
      similarTickets,
      reasoning: {
        priorityMatchedFrom: PRIORITY_KEYWORDS[suggestedPriority],
        tagsConsidered: Object.keys(TAG_KEYWORDS),
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
}
