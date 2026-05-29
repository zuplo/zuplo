import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { SpendRecord } from "../repositories/contracts.ts";

/**
 * Orchestrator: calc_total_spend.
 *
 * Sums spend records, optionally filtered by vendorId and/or year.
 * Returns the grand total plus a per-vendor breakdown.
 */

interface Body {
  vendorId?: string;
  year?: number;
}

interface SpendPage {
  items: SpendRecord[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = request.headers.get("authorization") ?? "";

  const yearStart = body.year ? Date.UTC(body.year, 0, 1) : null;
  const yearEnd = body.year ? Date.UTC(body.year + 1, 0, 1) : null;

  let totalCents = 0;
  const byVendor = new Map<string, number>();
  let recordCount = 0;

  const baseQs = new URLSearchParams({ limit: "200" });
  if (body.vendorId) baseQs.set("vendorId", body.vendorId);
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams(baseQs);
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<SpendPage>(context, `/spend?${qs}`, {
      headers: { authorization: auth },
    });
    for (const r of page.items) {
      if (yearStart && yearEnd) {
        const startMs = Date.parse(r.periodStart);
        if (startMs < yearStart || startMs >= yearEnd) continue;
      }
      totalCents += r.amountCents;
      byVendor.set(r.vendorId, (byVendor.get(r.vendorId) ?? 0) + r.amountCents);
      recordCount += 1;
    }
    cursor = page.nextCursor;
  } while (cursor);

  return new Response(
    JSON.stringify({
      vendorId: body.vendorId ?? null,
      year: body.year ?? null,
      recordCount,
      totalCents,
      byVendor: Array.from(byVendor.entries()).map(([vendorId, amountCents]) => ({
        vendorId,
        amountCents,
      })),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
