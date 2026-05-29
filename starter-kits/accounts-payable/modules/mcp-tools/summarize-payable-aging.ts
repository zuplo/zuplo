import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Bill } from "../repositories/bills.ts";

/**
 * Orchestrator MCP tool: summarize_payable_aging.
 *
 * Buckets unpaid bills (status approved or pending_approval) by 0-30/31-60/
 * 61-90/90+ days past due as of `asOf`.
 */

interface Body {
  asOf?: string;
}

interface BillPage { items: Bill[]; nextCursor: string | null }

type Bucket = "0-30" | "31-60" | "61-90" | "90+";
function bucketFor(days: number): Bucket | null {
  if (days <= 0) return null;
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const asOf = body.asOf ? new Date(body.asOf) : new Date();
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

  const buckets: Record<Bucket, { count: number; totalCents: number }> = {
    "0-30": { count: 0, totalCents: 0 },
    "31-60": { count: 0, totalCents: 0 },
    "61-90": { count: 0, totalCents: 0 },
    "90+": { count: 0, totalCents: 0 },
  };

  for (const b of bills) {
    if (b.status !== "approved" && b.status !== "pending_approval") continue;
    const due = new Date(b.dueDate).getTime();
    const days = Math.floor((asOf.getTime() - due) / (1000 * 60 * 60 * 24));
    const bucket = bucketFor(days);
    if (!bucket) continue;
    buckets[bucket].count += 1;
    buckets[bucket].totalCents += b.amountCents;
  }

  return new Response(
    JSON.stringify({
      asOf: asOf.toISOString(),
      buckets,
      grandTotalCents: Object.values(buckets).reduce((s, b) => s + b.totalCents, 0),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
