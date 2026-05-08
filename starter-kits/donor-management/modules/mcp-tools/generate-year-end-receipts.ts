import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Donor } from "../repositories/donors.ts";
import type { Donation } from "../repositories/donations.ts";
import { sendResendBatch, defaultFrom } from "../integrations/resend.ts";

interface Body {
  year: number;
  /** If true and RESEND_API_KEY is set, actually email the receipts. */
  email?: boolean;
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
  emailId?: string;
  emailError?: string;
}

/**
 * Orchestrator: generate_year_end_receipts.
 *
 * Aggregates donations per donor for the given calendar year. With
 * `email=true`, batches receipts through Resend (100 at a time) so the
 * agent can run year-end mail merge with one MCP call.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const year = body.year;
  const shouldEmail = !!body.email && !!environment.RESEND_API_KEY;
  const start = `${year}-01-01T00:00:00.000Z`;
  const end = `${year + 1}-01-01T00:00:00.000Z`;

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

  if (shouldEmail && receipts.length > 0) {
    const from = defaultFrom();
    const emailable = receipts.filter((r) => r.donorEmail && r.donorEmail.includes("@"));
    for (let i = 0; i < emailable.length; i += 100) {
      const batch = emailable.slice(i, i + 100);
      try {
        const res = await sendResendBatch(
          batch.map((r) => ({
            from,
            to: r.donorEmail,
            subject: `Your ${year} giving receipt`,
            text: receiptText(r),
            tags: [
              { name: "kit", value: "donor-management" },
              { name: "donor_id", value: r.donorId },
              { name: "year", value: String(year) },
            ],
          })),
        );
        for (let j = 0; j < batch.length; j++) {
          batch[j].emailId = res.data[j]?.id;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        for (const r of batch) r.emailError = msg;
        context.log.error(`year-end-receipts batch failed: ${msg}`);
      }
    }
  }

  return new Response(
    JSON.stringify({
      year,
      count: receipts.length,
      emailed: receipts.filter((r) => r.emailId).length,
      receipts,
    }),
    { headers: { "content-type": "application/json" } },
  );
}

function receiptText(r: Receipt): string {
  const lines = r.donations
    .map(
      (d) =>
        `  ${d.receivedAt.slice(0, 10)}: $${(d.amountCents / 100).toFixed(2)} (${d.paymentMethod})`,
    )
    .join("\n");
  return `Dear ${r.donorName},\n\nThank you for your generous support in ${r.year}. Below is the summary of your contributions for tax purposes.\n\nTotal contributions: $${(r.totalGivingCents / 100).toFixed(2)}\nTax-deductible amount: $${(r.totalTaxDeductibleCents / 100).toFixed(2)}\nNumber of gifts: ${r.donationCount}\n\nGift detail:\n${lines}\n\nNo goods or services were provided in exchange for these contributions. Please retain this receipt for your records.\n\nWith gratitude,\nThe team`;
}
