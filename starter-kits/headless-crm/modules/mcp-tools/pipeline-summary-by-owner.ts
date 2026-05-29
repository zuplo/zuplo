import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Deal, DealStage } from "../repositories/deals.ts";

interface Body {
  ownerEmail?: string;
}

interface DealPage { items: Deal[]; nextCursor: string | null; }

const OPEN_STAGES: DealStage[] = ["prospect", "qualified", "proposal", "negotiation"];

/**
 * Orchestrator: pipeline_summary_by_owner.
 *
 * Sums open-deal value by stage for one owner (or all owners if no
 * `ownerEmail` is passed). Returns a flat per-owner breakdown.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = request.headers.get("authorization") ?? "";

  type OwnerStat = { totalCents: number; dealCount: number; byStage: Record<string, { totalCents: number; dealCount: number }> };
  const byOwner = new Map<string, OwnerStat>();

  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<DealPage>(context, `/deals?${qs}`, {
      headers: { authorization: auth },
    });
    for (const d of page.items) {
      if (!OPEN_STAGES.includes(d.stage)) continue;
      if (body.ownerEmail && d.ownerEmail.toLowerCase() !== body.ownerEmail.toLowerCase()) continue;
      const owner = d.ownerEmail;
      const stat = byOwner.get(owner) ?? { totalCents: 0, dealCount: 0, byStage: {} };
      stat.totalCents += d.amountCents;
      stat.dealCount += 1;
      const stageStat = stat.byStage[d.stage] ?? { totalCents: 0, dealCount: 0 };
      stageStat.totalCents += d.amountCents;
      stageStat.dealCount += 1;
      stat.byStage[d.stage] = stageStat;
      byOwner.set(owner, stat);
    }
    cursor = page.nextCursor;
  } while (cursor);

  const summary = Array.from(byOwner.entries()).map(([ownerEmail, stat]) => ({
    ownerEmail,
    totalCents: stat.totalCents,
    dealCount: stat.dealCount,
    byStage: stat.byStage,
  }));

  return new Response(
    JSON.stringify({ ownerEmail: body.ownerEmail ?? null, owners: summary }),
    { headers: { "content-type": "application/json" } },
  );
}
