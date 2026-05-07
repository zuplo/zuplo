import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Donor } from "../repositories/donors.ts";
import type { Donation } from "../repositories/donations.ts";

interface Body {
  campaignId: string;
  criteria?: {
    minLifetimeCents?: number;
    gaveToCampaignInLastYears?: number;
    onlyActive?: boolean;
  };
}

interface DonorPage { items: Donor[]; nextCursor: string | null; }
interface DonationPage { items: Donation[]; nextCursor: string | null; }

/**
 * Orchestrator: segment_for_campaign.
 *
 * Returns donors matching a set of criteria for the named campaign:
 *   - lifetime giving above floor
 *   - donated to the same campaign within `gaveToCampaignInLastYears`
 *   - active only (default true)
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const c = body.criteria ?? {};
  const onlyActive = c.onlyActive ?? true;
  const minLifetimeCents = c.minLifetimeCents ?? 0;

  // Build set of donors who gave to the campaign within window
  let matchingDonorIds: Set<string> | null = null;
  if (c.gaveToCampaignInLastYears !== undefined) {
    matchingDonorIds = new Set();
    const cutoff = new Date(Date.now() - c.gaveToCampaignInLastYears * 365 * 86400000).toISOString();
    let dCursor: string | null | undefined;
    do {
      const qs = new URLSearchParams({ limit: "200" });
      if (dCursor) qs.set("cursor", dCursor);
      const page = await invokeJson<DonationPage>(context, `/donations?${qs}`, {
        headers: { authorization: auth },
      });
      for (const d of page.items) {
        if (d.campaignId !== body.campaignId) continue;
        if (d.receivedAt < cutoff) continue;
        matchingDonorIds.add(d.donorId);
      }
      dCursor = page.nextCursor;
    } while (dCursor);
  }

  const segment: Donor[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<DonorPage>(context, `/donors?${qs}`, {
      headers: { authorization: auth },
    });
    for (const donor of page.items) {
      if (onlyActive && donor.status !== "active") continue;
      if (donor.lifetimeGivingCents < minLifetimeCents) continue;
      if (matchingDonorIds && !matchingDonorIds.has(donor.id)) continue;
      segment.push(donor);
    }
    cursor = page.nextCursor;
    if (segment.length > 5000) break;
  } while (cursor);

  return new Response(
    JSON.stringify({ campaignId: body.campaignId, count: segment.length, donors: segment }),
    { headers: { "content-type": "application/json" } },
  );
}
