import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Donor } from "../repositories/donors.ts";
import type { Donation } from "../repositories/donations.ts";

interface Body {
  year: number;
}

interface DonorPage { items: Donor[]; nextCursor: string | null; }
interface DonationPage { items: Donation[]; nextCursor: string | null; }

interface Receipt {
  donorId: string;
  donorName: string;
  donorEmail: string;
  mailingAddress: string | null;
  year: number;
  totalGivingCents: number;
  totalTaxDeductibleCents: number;
  donationCount: number;
  donations: Array<{
    donationId: string;
    amountCents: number;
    taxDeductibleAmountCents: number;
    receivedAt: string;
    paymentMethod: string;
    restrictedFund: string | null;
  }>;
}

/**
 * Orchestrator: generate_year_end_receipts.
 *
 * Aggregates donations per donor for the given calendar year and returns
 * receipt-ready data structures. Skips anonymous donations from the per-line
 * detail (still rolled into the donor total since donor identity is known
 * server-side).
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const year = body.year;
  const start = `${year}-01-01T00:00:00.000Z`;
  const end = `${year + 1}-01-01T00:00:00.000Z`;

  // Collect donations in window keyed by donorId
  const byDonor = new Map<string, Donation[]>();
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<DonationPage>(context, `/donations?${qs}`, {
      headers: { authorization: auth },
    });
    for (const d of page.items) {
      if (d.receivedAt < start || d.receivedAt >= end) continue;
      const list = byDonor.get(d.donorId) ?? [];
      list.push(d);
      byDonor.set(d.donorId, list);
    }
    cursor = page.nextCursor;
  } while (cursor);

  // Look up donor records
  const donorMap = new Map<string, Donor>();
  let dCursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (dCursor) qs.set("cursor", dCursor);
    const page = await invokeJson<DonorPage>(context, `/donors?${qs}`, {
      headers: { authorization: auth },
    });
    for (const donor of page.items) {
      if (byDonor.has(donor.id)) donorMap.set(donor.id, donor);
    }
    dCursor = page.nextCursor;
  } while (dCursor);

  const receipts: Receipt[] = [];
  for (const [donorId, donations] of byDonor) {
    const donor = donorMap.get(donorId);
    if (!donor) continue;
    let total = 0;
    let totalDeductible = 0;
    for (const d of donations) {
      total += d.amountCents;
      totalDeductible += d.taxDeductibleAmountCents;
    }
    receipts.push({
      donorId,
      donorName: `${donor.firstName} ${donor.lastName}`.trim(),
      donorEmail: donor.email,
      mailingAddress: donor.mailingAddress,
      year,
      totalGivingCents: total,
      totalTaxDeductibleCents: totalDeductible,
      donationCount: donations.length,
      donations: donations.map((d) => ({
        donationId: d.id,
        amountCents: d.amountCents,
        taxDeductibleAmountCents: d.taxDeductibleAmountCents,
        receivedAt: d.receivedAt,
        paymentMethod: d.paymentMethod,
        restrictedFund: d.restrictedFund,
      })),
    });
  }

  return new Response(
    JSON.stringify({ year, count: receipts.length, receipts }),
    { headers: { "content-type": "application/json" } },
  );
}
