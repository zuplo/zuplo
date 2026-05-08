import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Donor } from "../repositories/donors.ts";
import { sendResendBatch, defaultFrom } from "../integrations/resend.ts";

interface Body {
  monthsLapsed?: number;
  minLifetimeCents?: number;
  /** If true and RESEND_API_KEY is set, send a re-engagement email to each lapsed donor. */
  sendReengagement?: boolean;
}

interface DonorPage {
  items: Donor[];
  nextCursor: string | null;
}

/**
 * Orchestrator: identify_lapsed_donors.
 *
 * Returns donors who haven't given in N months but have at least the
 * specified lifetime giving total. With `sendReengagement=true`, batches a
 * re-engagement email through Resend.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const monthsLapsed = body.monthsLapsed ?? 12;
  const minLifetimeCents = body.minLifetimeCents ?? 0;
  const cutoff = new Date(Date.now() - monthsLapsed * 30 * 86400000).toISOString();
  const auth = request.headers.get("authorization") ?? "";
  const shouldEmail = !!body.sendReengagement && !!environment.RESEND_API_KEY;

  const lapsed: Donor[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<DonorPage>(context, `/donors?${qs}`, {
      headers: { authorization: auth },
    });
    for (const donor of page.items) {
      if (donor.status === "do_not_contact") continue;
      if (donor.lifetimeGivingCents < minLifetimeCents) continue;
      const last = donor.lastGiftDate;
      if (last && last >= cutoff) continue;
      lapsed.push(donor);
    }
    cursor = page.nextCursor;
    if (lapsed.length > 2000) break;
  } while (cursor);

  let emailedCount = 0;
  if (shouldEmail && lapsed.length > 0) {
    const from = defaultFrom();
    const emailable = lapsed.filter((d) => d.email && d.email.includes("@"));
    for (let i = 0; i < emailable.length; i += 100) {
      const batch = emailable.slice(i, i + 100);
      try {
        const res = await sendResendBatch(
          batch.map((d) => ({
            from,
            to: d.email,
            subject: "We miss you",
            text: `Hi ${d.firstName},\n\nIt's been a while since your last gift, and we wanted to reach out and say thank you for the support you've shown us — your lifetime giving of $${(d.lifetimeGivingCents / 100).toFixed(2)} has helped us reach more people than we could have on our own.\n\nWe'd love to have you back. If you'd like to give again, you can do so any time at our donate page.\n\nWith gratitude,\nThe team`,
            tags: [
              { name: "kit", value: "donor-management" },
              { name: "campaign", value: "reengagement" },
              { name: "donor_id", value: d.id },
            ],
          })),
        );
        emailedCount += res.data.length;
      } catch (err) {
        context.log.error(
          `identify_lapsed_donors reengagement send failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return new Response(
    JSON.stringify({
      count: lapsed.length,
      monthsLapsed,
      minLifetimeCents,
      emailed: shouldEmail ? emailedCount : undefined,
      donors: lapsed,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
