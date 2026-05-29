import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Lead } from "../repositories/leads.ts";

interface Body {
  ownerEmail?: string;
  daysSince?: number;
}

interface LeadPage {
  items: Lead[];
  nextCursor: string | null;
}

/**
 * Orchestrator: summarize_unworked_leads.
 *
 * Lists leads that have been assigned but not contacted within `daysSince`
 * days. Optionally filters by `ownerEmail`. Useful for the SDR manager's
 * weekly hygiene review or an LLM-driven pipeline-cleanup workflow.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const daysSince = Math.max(1, Math.min(365, body.daysSince ?? 7));
  const cutoff = new Date(Date.now() - daysSince * 86400000).toISOString();
  const auth = request.headers.get("authorization") ?? "";
  const owner = body.ownerEmail?.toLowerCase();

  const stale: Lead[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<LeadPage>(context, `/leads?${qs}`, {
      headers: { authorization: auth },
    });
    for (const lead of page.items) {
      if (lead.status !== "new" && lead.status !== "contacted") continue;
      if (!lead.assignedAt) continue;
      if (lead.assignedAt > cutoff) continue;
      if (owner && lead.assignedTo?.toLowerCase() !== owner) continue;
      stale.push(lead);
    }
    cursor = page.nextCursor;
    if (stale.length > 1000) break;
  } while (cursor);

  // Group by owner so the LLM can produce per-rep nudges.
  const byOwner: Record<string, { count: number; leads: Lead[] }> = {};
  for (const lead of stale) {
    const key = lead.assignedTo ?? "unassigned";
    const bucket = (byOwner[key] ??= { count: 0, leads: [] });
    bucket.count += 1;
    if (bucket.leads.length < 25) bucket.leads.push(lead);
  }

  return new Response(
    JSON.stringify({
      thresholdDays: daysSince,
      ownerFilter: owner ?? null,
      total: stale.length,
      byOwner,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
