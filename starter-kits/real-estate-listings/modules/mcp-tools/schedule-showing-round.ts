import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Listing } from "../repositories/listings.ts";

/**
 * Orchestrator MCP tool: schedule_showing_round.
 *
 * Given a lead, a list of listing ids, and a date range, proposes a sequence
 * of showing time slots packed efficiently into a single tour. The agent can
 * use the proposed slots to actually create showings via `schedule_showing`.
 */

interface Body {
  leadId: string;
  listingIds: string[];
  dateRange: { start: string; end: string };
  durationMinutes?: number;
  bufferMinutes?: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (
    !body.leadId ||
    !body.listingIds ||
    !Array.isArray(body.listingIds) ||
    body.listingIds.length === 0 ||
    !body.dateRange?.start ||
    !body.dateRange?.end
  ) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "leadId, listingIds, and dateRange are required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const start = new Date(body.dateRange.start);
  const end = new Date(body.dateRange.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "Invalid dateRange" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const duration = body.durationMinutes ?? 30;
  const buffer = body.bufferMinutes ?? 15;
  const slotMs = (duration + buffer) * 60 * 1000;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  // Cluster slots starting at the next 30-minute boundary inside the window.
  const tourStart = new Date(start.getTime());
  tourStart.setSeconds(0, 0);
  if (tourStart.getMinutes() % 30 !== 0) {
    tourStart.setMinutes(tourStart.getMinutes() + (30 - (tourStart.getMinutes() % 30)));
  }

  const proposals: Array<{
    listingId: string;
    listing: Listing;
    proposedStart: string;
    proposedEnd: string;
  }> = [];

  let t = tourStart.getTime();
  for (const listingId of body.listingIds) {
    const proposedStart = new Date(t);
    const proposedEnd = new Date(t + duration * 60 * 1000);
    if (proposedEnd.getTime() > end.getTime()) break;

    const listing = await invokeJson<Listing>(
      context,
      `/listings/${encodeURIComponent(listingId)}`,
      { headers: auth },
    );

    proposals.push({
      listingId,
      listing,
      proposedStart: proposedStart.toISOString(),
      proposedEnd: proposedEnd.toISOString(),
    });

    t += slotMs;
  }

  return new Response(
    JSON.stringify({
      leadId: body.leadId,
      durationMinutes: duration,
      bufferMinutes: buffer,
      proposedTourStart: tourStart.toISOString(),
      proposalCount: proposals.length,
      proposals,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
