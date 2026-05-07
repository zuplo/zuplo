import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Contract } from "../repositories/contracts.ts";

/**
 * Orchestrator: flag_upcoming_renewals.
 *
 * Returns active contracts whose endDate falls within `daysAhead` days AND
 * where the notice period has already started or is starting soon. This
 * surfaces the "act now to give notice" cases an agent should escalate.
 */

interface Body {
  daysAhead?: number;
}

interface ContractPage {
  items: Contract[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const daysAhead = Math.max(1, Math.min(365, body.daysAhead ?? 90));
  const auth = request.headers.get("authorization") ?? "";

  const now = Date.now();
  const horizonMs = now + daysAhead * 86400000;

  const flagged: Array<Contract & {
    daysUntilEnd: number;
    daysUntilNotice: number;
    noticeWindowOpen: boolean;
  }> = [];

  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ContractPage>(context, `/contracts?${qs}`, {
      headers: { authorization: auth },
    });
    for (const c of page.items) {
      if (c.status !== "active") continue;
      const endMs = Date.parse(c.endDate);
      if (Number.isNaN(endMs) || endMs > horizonMs) continue;
      const noticeStart = endMs - c.noticePeriodDays * 86400000;
      flagged.push({
        ...c,
        daysUntilEnd: Math.round((endMs - now) / 86400000),
        daysUntilNotice: Math.round((noticeStart - now) / 86400000),
        noticeWindowOpen: noticeStart <= now,
      });
    }
    cursor = page.nextCursor;
  } while (cursor);

  flagged.sort((a, b) => a.daysUntilEnd - b.daysUntilEnd);

  return new Response(
    JSON.stringify({
      daysAhead,
      count: flagged.length,
      contracts: flagged,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
