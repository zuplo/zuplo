import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Item } from "../repositories/items.ts";

/**
 * Orchestrator MCP tool: summarize_items.
 *
 * Calls list_items via context.invokeRoute (so it inherits auth + rate-limit
 * + tenant scoping automatically), groups results by status, and returns a
 * structured summary for the LLM.
 *
 * Replace this with your kit's domain-specific orchestrator:
 *   - "chase_overdue_invoices" — list overdue, group by customer, draft emails
 *   - "find_team_coverage_gaps" — list PTO, intersect with calendar, flag holes
 *   - "triage_incoming_ticket" — pick category, suggest owner, draft response
 */

interface Body {
  topPerStatus?: number;
}

interface ItemPage {
  items: Item[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const topPerStatus = Math.max(1, Math.min(20, body.topPerStatus ?? 3));

  // Pull a wide enough window of items in one shot. For very large tenants,
  // a real orchestrator would paginate or maintain a materialized count.
  const allItems: Item[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    // Internal call inherits the inbound api-key-inbound + rate-limit policies
    // because invokeRoute re-runs the route's policy chain.
    const page = await invokeJson<ItemPage>(context, `/items?${qs}`, {
      headers: { authorization: request.headers.get("authorization") ?? "" },
    });
    allItems.push(...page.items);
    cursor = page.nextCursor;
    if (allItems.length > 2000) break; // safety cap
  } while (cursor);

  const byStatus: Record<string, { count: number; recent: Item[] }> = {};
  for (const item of allItems) {
    const bucket = (byStatus[item.status] ??= { count: 0, recent: [] });
    bucket.count += 1;
    if (bucket.recent.length < topPerStatus) bucket.recent.push(item);
  }

  return new Response(JSON.stringify(byStatus), {
    headers: { "content-type": "application/json" },
  });
}
