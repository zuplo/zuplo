import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Lead, Listing } from "../repositories/listings.ts";

/**
 * Orchestrator MCP tool: match_lead_to_listings.
 *
 * Looks up the lead, then walks active listings finding ones that fit the
 * lead's budget, area interest, and minimum bedroom count. Returns the
 * top-N matches sorted by how close they are to the budget.
 */

interface Body {
  leadId: string;
  limit?: number;
}

interface ListingPage { items: Listing[]; nextCursor: string | null; }

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.leadId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "leadId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const limit = Math.max(1, Math.min(50, body.limit ?? 10));
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const lead = await invokeJson<Lead>(context, `/leads/${encodeURIComponent(body.leadId)}`, {
    headers: auth,
  });

  const listings: Listing[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ListingPage>(context, `/listings?${qs}`, { headers: auth });
    listings.push(...page.items);
    cursor = page.nextCursor;
    if (listings.length > 5000) break;
  } while (cursor);

  const areaTokens = new Set(
    lead.areaInterest
      .toLowerCase()
      .split(/[, ]+/)
      .filter((t) => t.length >= 2),
  );

  const matches = listings
    .filter((l) => l.status === "active")
    .filter((l) => {
      if (lead.budgetCents !== null && l.listPriceCents > lead.budgetCents) return false;
      if (lead.bedroomsMin !== null && l.bedrooms < lead.bedroomsMin) return false;
      if (areaTokens.size > 0) {
        const place = `${l.city} ${l.state} ${l.zip}`.toLowerCase();
        let hit = false;
        for (const t of areaTokens) if (place.includes(t)) { hit = true; break; }
        if (!hit) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Prefer listings closest to budget without exceeding it.
      const budget = lead.budgetCents ?? Number.POSITIVE_INFINITY;
      return Math.abs(budget - a.listPriceCents) - Math.abs(budget - b.listPriceCents);
    })
    .slice(0, limit);

  return new Response(
    JSON.stringify({
      leadId: lead.id,
      matchCount: matches.length,
      matches,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
