import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Donor } from "../repositories/donors.ts";

interface Body {
  monthsLapsed?: number;
  minLifetimeCents?: number;
}

interface DonorPage {
  items: Donor[];
  nextCursor: string | null;
}

/**
 * Orchestrator: identify_lapsed_donors.
 *
 * Returns donors who have not given in N months but have a lifetime giving
 * threshold. Useful for re-engagement campaigns.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const monthsLapsed = body.monthsLapsed ?? 12;
  const minLifetimeCents = body.minLifetimeCents ?? 0;
  const cutoff = new Date(Date.now() - monthsLapsed * 30 * 86400000).toISOString();
  const auth = request.headers.get("authorization") ?? "";

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

  return new Response(
    JSON.stringify({ count: lapsed.length, monthsLapsed, minLifetimeCents, donors: lapsed }),
    { headers: { "content-type": "application/json" } },
  );
}
