import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Listing, Offer } from "../repositories/listings.ts";

/**
 * Orchestrator MCP tool: draft_offer_summary.
 *
 * Returns a chronological summary of every offer made on a listing — useful
 * when a seller asks for a recap before accepting or countering.
 */

interface Body {
  listingId: string;
}

interface OfferPage { items: Offer[]; nextCursor: string | null; }

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.listingId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "listingId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const listing = await invokeJson<Listing>(context, `/listings/${encodeURIComponent(body.listingId)}`, {
    headers: auth,
  });

  const offers: Offer[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<OfferPage>(context, `/offers?${qs}`, { headers: auth });
    offers.push(...page.items);
    cursor = page.nextCursor;
    if (offers.length > 5000) break;
  } while (cursor);

  const forListing = offers
    .filter((o) => o.listingId === body.listingId)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  const lines: string[] = [];
  lines.push(`Offer history for ${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`);
  lines.push(`List price: ${fmtUsd(listing.listPriceCents)}`);
  lines.push("");
  if (forListing.length === 0) {
    lines.push("No offers received yet.");
  } else {
    for (const o of forListing) {
      const delta = o.amountCents - listing.listPriceCents;
      const tag = delta >= 0 ? `+${fmtUsd(delta)}` : `-${fmtUsd(-delta)}`;
      lines.push(`- ${o.submittedAt.slice(0, 10)} — ${fmtUsd(o.amountCents)} (${tag} vs list, ${o.status})${o.contingencies.length ? ` [${o.contingencies.join(", ")}]` : ""}`);
    }
  }

  const acceptedOffer = forListing.find((o) => o.status === "accepted");

  return new Response(
    JSON.stringify({
      listingId: body.listingId,
      offerCount: forListing.length,
      acceptedOfferId: acceptedOffer ? acceptedOffer.id : null,
      summary: lines.join("\n"),
      offers: forListing,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
