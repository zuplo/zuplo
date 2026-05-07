import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Bill } from "../repositories/bills.ts";

/**
 * Orchestrator MCP tool: detect_duplicate_bills.
 *
 * Finds bills with the same vendor + amount + dueDate within a 7-day window.
 * Optional `vendorId` restricts the search to one vendor.
 */

interface Body {
  vendorId?: string;
}

interface BillPage { items: Bill[]; nextCursor: string | null }

interface DupGroup {
  vendorId: string;
  amountCents: number;
  bills: Bill[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const bills: Bill[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<BillPage>(context, `/bills?${qs}`, { headers: auth });
    bills.push(...page.items);
    cursor = page.nextCursor;
    if (bills.length > 50000) break;
  } while (cursor);

  const candidates = body.vendorId ? bills.filter((b) => b.vendorId === body.vendorId) : bills;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // Group by vendorId+amount, then within each group find pairs whose dueDates
  // are within the window.
  const byKey = new Map<string, Bill[]>();
  for (const b of candidates) {
    const key = `${b.vendorId}|${b.amountCents}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(b);
  }

  const groups: DupGroup[] = [];
  for (const [key, list] of byKey.entries()) {
    if (list.length < 2) continue;
    const sorted = list.slice().sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    const cluster: Bill[] = [];
    for (const bill of sorted) {
      if (cluster.length === 0) {
        cluster.push(bill);
        continue;
      }
      const last = cluster[cluster.length - 1];
      if (new Date(bill.dueDate).getTime() - new Date(last.dueDate).getTime() <= sevenDaysMs) {
        cluster.push(bill);
      } else {
        if (cluster.length >= 2) {
          const [vendorId, amountStr] = key.split("|");
          groups.push({ vendorId, amountCents: parseInt(amountStr, 10), bills: cluster.slice() });
        }
        cluster.length = 0;
        cluster.push(bill);
      }
    }
    if (cluster.length >= 2) {
      const [vendorId, amountStr] = key.split("|");
      groups.push({ vendorId, amountCents: parseInt(amountStr, 10), bills: cluster.slice() });
    }
  }

  return new Response(
    JSON.stringify({
      duplicateGroupCount: groups.length,
      duplicateBillCount: groups.reduce((s, g) => s + g.bills.length, 0),
      groups,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
