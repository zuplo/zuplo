import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Lead } from "../repositories/leads.ts";
import type { RoutingRule } from "../repositories/routing-rules.ts";

interface Body {
  leadId: string;
}

interface RoutingRulePage {
  items: RoutingRule[];
  nextCursor: string | null;
}

/**
 * Orchestrator: route_lead_intelligently.
 *
 * Loads the lead, evaluates active routing rules in priority order, picks
 * the first whose conditions match the lead, and assigns the lead to the
 * configured rep. Returns the assignment + a human-readable explanation
 * trace so the LLM can tell ops *why* a rep was chosen.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";

  const lead = await invokeJson<Lead>(context, `/leads/${body.leadId}`, {
    headers: { authorization: auth },
  });

  // Pull all active rules sorted by priority (asc).
  const rules: RoutingRule[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<RoutingRulePage>(context, `/routing-rules?${qs}`, {
      headers: { authorization: auth },
    });
    rules.push(...page.items.filter((r) => r.active));
    cursor = page.nextCursor;
  } while (cursor);

  rules.sort((a, b) => a.priority - b.priority);

  // Find the first rule whose conditions match.
  const trace: Array<{ ruleId: string; ruleName: string; matched: boolean; reason: string }> = [];
  let chosen: RoutingRule | null = null;
  for (const rule of rules) {
    const reasons: string[] = [];
    let matched = true;
    for (const [key, expected] of Object.entries(rule.conditions)) {
      const actual = (lead as unknown as Record<string, unknown>)[key];
      if (actual !== expected) {
        matched = false;
        reasons.push(`${key}=${String(actual)} ≠ ${String(expected)}`);
      } else {
        reasons.push(`${key}=${String(actual)} ✓`);
      }
    }
    trace.push({
      ruleId: rule.id,
      ruleName: rule.name,
      matched,
      reason: reasons.join("; "),
    });
    if (matched) {
      chosen = rule;
      break;
    }
  }

  if (!chosen) {
    return new Response(
      JSON.stringify({
        leadId: lead.id,
        assigned: false,
        reason: "No active routing rule matched this lead",
        trace,
      }),
      { headers: { "content-type": "application/json" } },
    );
  }

  await invokeJson(context, `/leads/${lead.id}/assign`, {
    method: "PATCH",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify({ assignTo: chosen.assignTo }),
  });

  return new Response(
    JSON.stringify({
      leadId: lead.id,
      assigned: true,
      assignedTo: chosen.assignTo,
      ruleId: chosen.id,
      ruleName: chosen.name,
      trace,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
