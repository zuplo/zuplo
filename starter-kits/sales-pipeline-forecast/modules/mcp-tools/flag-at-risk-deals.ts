import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Deal } from "../repositories/deals.ts";

interface Body {
  staleDays?: number;
}

interface DealPage { items: Deal[]; nextCursor: string | null; }

/**
 * Orchestrator: flag_at_risk_deals.
 *
 * Returns deals where:
 *   - `expectedCloseDate` is in the past and stage is not closed, or
 *   - the deal has been in the same stage for more than `staleDays` (default 30)
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const staleDays = body.staleDays ?? 30;
  const today = new Date().toISOString().slice(0, 10);
  const staleCutoff = new Date(Date.now() - staleDays * 86400000).toISOString();

  const flagged: Array<{ deal: Deal; reasons: string[] }> = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<DealPage>(context, `/deals?${qs}`, {
      headers: { authorization: auth },
    });
    for (const d of page.items) {
      if (d.stage === "closed_won" || d.stage === "closed_lost") continue;
      const reasons: string[] = [];
      if (d.expectedCloseDate < today) reasons.push("expected_close_in_past");
      if (d.stageEnteredAt && d.stageEnteredAt < staleCutoff) reasons.push("stage_stale");
      if (reasons.length > 0) flagged.push({ deal: d, reasons });
    }
    cursor = page.nextCursor;
  } while (cursor);

  return new Response(
    JSON.stringify({ count: flagged.length, staleDays, flagged }),
    { headers: { "content-type": "application/json" } },
  );
}
