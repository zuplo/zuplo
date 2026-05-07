import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Customer, Invoice } from "../repositories/invoices.ts";

/**
 * Orchestrator MCP tool: chase_overdue_invoices.
 *
 * Lists invoices past their due date and produces a draft chase email per
 * invoice (LLM picks tone). Customer name is hydrated from /customers.
 */

interface Body {
  daysOverdue?: number;
}

interface InvoicePage {
  items: Invoice[];
  nextCursor: string | null;
}

interface CustomerPage {
  items: Customer[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const daysOverdue = Math.max(0, Math.min(365, body.daysOverdue ?? 0));
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const allInvoices: Invoice[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<InvoicePage>(context, `/invoices?${qs}`, { headers: auth });
    allInvoices.push(...page.items);
    cursor = page.nextCursor;
    if (allInvoices.length > 5000) break;
  } while (cursor);

  const allCustomers: Customer[] = [];
  let cCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cCursor) qs.set("cursor", cCursor);
    const page = await invokeJson<CustomerPage>(context, `/customers?${qs}`, { headers: auth });
    allCustomers.push(...page.items);
    cCursor = page.nextCursor;
    if (allCustomers.length > 5000) break;
  } while (cCursor);
  const customerById = new Map(allCustomers.map((c) => [c.id, c]));

  const now = new Date();
  const overdue = allInvoices
    .filter((i) => (i.status === "sent" || i.status === "overdue") && i.dueDate)
    .filter((i) => {
      const due = new Date(i.dueDate).getTime();
      const days = Math.floor((now.getTime() - due) / (1000 * 60 * 60 * 24));
      return days >= daysOverdue;
    });

  const result = overdue.map((i) => {
    const customer = customerById.get(i.customerId) ?? null;
    const due = new Date(i.dueDate);
    const days = Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
    const total = (i.totalCents / 100).toFixed(2);
    const draftEmail = customer
      ? `Hi ${customer.name},\n\nThis is a friendly reminder that invoice ${i.number} for ${i.currency} ${total} was due on ${i.dueDate} and is now ${days} day${days === 1 ? "" : "s"} overdue.\n\nPlease let us know if you need anything to process payment.\n\nThanks!`
      : `Invoice ${i.number} (${i.currency} ${total}) is ${days} days overdue. Customer not found.`;
    return {
      invoice: i,
      customer,
      daysOverdue: days,
      draftEmail,
    };
  });

  return new Response(
    JSON.stringify({
      count: result.length,
      totalOutstandingCents: result.reduce((sum, r) => sum + r.invoice.totalCents, 0),
      invoices: result,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
