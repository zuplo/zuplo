import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Payout } from "../repositories/payouts.ts";
import type { Credit } from "../repositories/credits.ts";

/**
 * Orchestrator MCP tool: flag_clawback_risk.
 *
 * Scans approved/paid payouts and flags any whose underlying credits
 * include deals that have since flipped to "closed_lost" or "refunded".
 * Returns a list with reasons so finance can review and issue clawbacks
 * before the next payroll cycle.
 */

interface PayoutPage {
  items: Payout[];
  nextCursor: string | null;
}

interface CreditPage {
  items: Credit[];
  nextCursor: string | null;
}

const RISK_DEAL_STATUSES = new Set(["closed_lost", "refunded"]);

export default async function (request: ZuploRequest, context: ZuploContext) {
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  // Pull all credits and bucket the at-risk ones by (repEmail, period)
  // so we can reconcile against payouts in one pass.
  const allCredits: Credit[] = [];
  let cCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cCursor) qs.set("cursor", cCursor);
    const page = await invokeJson<CreditPage>(context, `/credits?${qs}`, {
      headers: auth,
    });
    allCredits.push(...page.items);
    cCursor = page.nextCursor;
    if (allCredits.length > 10000) break;
  } while (cCursor);

  const riskByKey = new Map<string, Credit[]>();
  for (const c of allCredits) {
    if (!c.dealStatus || !RISK_DEAL_STATUSES.has(c.dealStatus)) continue;
    const key = `${c.repEmail}::${c.period}`;
    const list = riskByKey.get(key) ?? [];
    list.push(c);
    riskByKey.set(key, list);
  }
  if (riskByKey.size === 0) {
    return new Response(
      JSON.stringify({ count: 0, items: [] }),
      { headers: { "content-type": "application/json" } },
    );
  }

  // Walk payouts; flag those where the rep+period appear in riskByKey
  // and the payout has actually been disbursed (or is at least approved).
  const flagged: Array<{
    payout: Payout;
    riskCredits: Credit[];
    exposureCents: number;
    reason: string;
  }> = [];
  let pCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (pCursor) qs.set("cursor", pCursor);
    const page = await invokeJson<PayoutPage>(context, `/payouts?${qs}`, {
      headers: auth,
    });
    for (const p of page.items) {
      if (p.status !== "approved" && p.status !== "paid") continue;
      const key = `${p.repEmail}::${p.period}`;
      const risky = riskByKey.get(key);
      if (!risky?.length) continue;
      const exposureCents = risky.reduce(
        (s, c) => s + Math.round(c.amountCents * (c.splitPercent / 100)),
        0,
      );
      const statuses = Array.from(new Set(risky.map((c) => c.dealStatus))).join(", ");
      flagged.push({
        payout: p,
        riskCredits: risky,
        exposureCents,
        reason: `Underlying deal(s) flipped to ${statuses} after payout was ${p.status}.`,
      });
    }
    pCursor = page.nextCursor;
    if (flagged.length > 5000) break;
  } while (pCursor);

  const totalExposureCents = flagged.reduce((s, f) => s + f.exposureCents, 0);

  return new Response(
    JSON.stringify({
      count: flagged.length,
      totalExposureCents,
      items: flagged,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
