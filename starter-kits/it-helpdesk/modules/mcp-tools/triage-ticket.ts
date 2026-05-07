import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import { categoryRepository } from "../repositories/tickets.ts";
import type { IncidentTicket } from "../repositories/tickets.ts";
import { requireTenant } from "../_shared/auth/index.ts";

/**
 * Orchestrator: triage_ticket.
 *
 * Reads a ticket and suggests a category, priority, and assignee based on
 * keyword heuristics in the subject + body. The agent (or human) can then
 * apply via update_ticket / assign_ticket.
 */

interface Body {
  ticketId: string;
}

const CATEGORY_KEYWORDS: Record<IncidentTicket["category"], string[]> = {
  hardware: ["laptop", "monitor", "keyboard", "mouse", "screen", "battery", "charger", "printer"],
  software: ["app", "install", "crash", "error", "update", "bug", "license", "office", "outlook"],
  access: ["password", "login", "sso", "mfa", "2fa", "locked", "permission", "access", "vpn"],
  network: ["wifi", "ethernet", "internet", "vpn", "slow", "connection", "router", "dns"],
  other: [],
};

const PRIORITY_KEYWORDS: Record<IncidentTicket["priority"], string[]> = {
  critical: ["down", "outage", "production", "urgent", "all hands", "blocked entirely"],
  high: ["asap", "blocked", "important", "deadline", "customer"],
  med: [],
  low: ["minor", "whenever", "no rush", "nice to have"],
};

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

  const haystack = `${ticket.subject} ${ticket.body}`.toLowerCase();

  // Score categories by keyword hits.
  let suggestedCategory: IncidentTicket["category"] = "other";
  let bestCategoryScore = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<[
    IncidentTicket["category"],
    string[],
  ]>) {
    const score = keywords.reduce((acc, kw) => acc + (haystack.includes(kw) ? 1 : 0), 0);
    if (score > bestCategoryScore) {
      bestCategoryScore = score;
      suggestedCategory = cat;
    }
  }

  // Score priorities; default med.
  let suggestedPriority: IncidentTicket["priority"] = "med";
  for (const [prio, keywords] of Object.entries(PRIORITY_KEYWORDS) as Array<[
    IncidentTicket["priority"],
    string[],
  ]>) {
    if (keywords.some((kw) => haystack.includes(kw))) {
      suggestedPriority = prio;
      // critical > high > med > low: stop on first hit per rank order
      if (prio === "critical" || prio === "high") break;
    }
  }

  // Look up default assignee for the suggested category. Categories live in
  // the same tenant store; we query directly since /categories is not exposed
  // on the public API surface.
  let suggestedAssignee: string | null = null;
  let categoryCursor: string | null | undefined;
  do {
    const page = await categoryRepository.list(tenantId, {
      limit: 200,
      cursor: categoryCursor ?? undefined,
    });
    const match = page.items.find((c) => c.slug === suggestedCategory);
    if (match) {
      suggestedAssignee = match.defaultAssigneeEmail ?? null;
      break;
    }
    categoryCursor = page.nextCursor;
  } while (categoryCursor);

  return new Response(
    JSON.stringify({
      ticketId: ticket.id,
      suggestedCategory,
      suggestedPriority,
      suggestedAssignee,
      reasoning: {
        categoryHits: bestCategoryScore,
        haystackPreview: haystack.slice(0, 200),
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
}
