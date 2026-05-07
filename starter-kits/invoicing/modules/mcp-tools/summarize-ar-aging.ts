import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Invoice } from "../repositories/invoices.ts";

/**
 * Orchestrator MCP tool: summarize_ar_aging.
 *
 * Builds an AR aging summary keyed by 0-30/31-60/61-90/90+ day buckets based
 * on dueDate vs `asOf` (defaults to today).
 */

interface Body {
  asOf?: string;
}

interface InvoicePage {
  items: Invoice[];
  nextCursor: string | null;
}

type Bucket = "0-30" | "31-60" | "61-90" | "90+";

function bucketFor(daysPastDue: number): Bucket | null {
  if (daysPastDue <= 0) return null;
  if (daysPastDue <= 30) return "0-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const asOf = body.asOf ? new Date(body.asOf) : new Date();
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const all: Invoice[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<InvoicePage>(context, `/invoices?${qs}`, { headers: auth });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 10000) break;
  } while (cursor);

  const buckets: Record<Bucket, { count: number; totalCents: number }> = {
    "0-30": { count: 0, totalCents: 0 },
    "31-60": { count: 0, totalCents: 0 },
    "61-90": { count: 0, totalCents: 0 },
    "90+": { count: 0, totalCents: 0 },
  };

  for (const inv of all) {
    if (inv.status !== "sent" && inv.status !== "overdue") continue;
    const due = new Date(inv.dueDate).getTime();
    const days = Math.floor((asOf.getTime() - due) / (1000 * 60 * 60 * 24));
    const b = bucketFor(days);
    if (!b) continue;
    buckets[b].count += 1;
    buckets[b].totalCents += inv.totalCents;
  }

  const grandTotal = Object.values(buckets).reduce((s, b) => s + b.totalCents, 0);

  return new Response(
    JSON.stringify({
      asOf: asOf.toISOString(),
      buckets,
      grandTotalCents: grandTotal,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
