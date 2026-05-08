import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Customer, Invoice } from "../repositories/invoices.ts";
import {
  upsertStripeCustomer,
  createAndSendStripeInvoice,
} from "../integrations/stripe.ts";
import { sendResendEmail, defaultFrom } from "../integrations/resend.ts";

/**
 * Orchestrator MCP tool: chase_overdue_invoices.
 *
 * 1. Walk the AR aging in this tenant.
 * 2. For each overdue invoice, draft a chase email (LLM rewrites tone).
 * 3. If `dryRun=false`, push the invoice to Stripe (hosted invoice URL) and
 *    send the chase via Resend with the link inline.
 *
 * The default is `dryRun=true` so this tool is safe for an LLM to call
 * exploratorily — it returns the draft and the customer list, but doesn't
 * email anyone or charge anything until the caller flips the switch.
 */

interface Body {
  daysOverdue?: number;
  dryRun?: boolean;
}

interface InvoicePage { items: Invoice[]; nextCursor: string | null }
interface CustomerPage { items: Customer[]; nextCursor: string | null }

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const daysOverdue = Math.max(0, Math.min(365, body.daysOverdue ?? 0));
  const dryRun = body.dryRun !== false; // default true
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

  const results = [];
  for (const i of overdue) {
    const customer = customerById.get(i.customerId) ?? null;
    const due = new Date(i.dueDate);
    const days = Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
    const total = (i.totalCents / 100).toFixed(2);

    let stripeUrl: string | null = null;
    let emailId: string | null = null;
    const errors: string[] = [];

    if (!dryRun && customer) {
      try {
        const stripeCustomer = await upsertStripeCustomer({
          email: customer.email,
          name: customer.name,
          tenantCustomerId: customer.id,
        });
        const stripeInvoice = await createAndSendStripeInvoice({
          stripeCustomerId: stripeCustomer.id,
          amountCents: i.totalCents,
          currency: i.currency,
          description: `Invoice ${i.number} — originally due ${i.dueDate}`,
          daysUntilDue: 7,
          metadata: {
            tenant_id: i.tenantId,
            tenant_invoice_id: i.id,
            tenant_customer_id: customer.id,
          },
        });
        stripeUrl = stripeInvoice.hosted_invoice_url;

        const draftEmail = renderDraft(i, customer, days, total, stripeUrl);
        const sent = await sendResendEmail({
          from: defaultFrom(),
          to: customer.email,
          subject: `Invoice ${i.number} is ${days} day${days === 1 ? "" : "s"} overdue`,
          text: draftEmail,
          tags: [
            { name: "kit", value: "invoicing" },
            { name: "invoice_id", value: i.id },
          ],
        });
        emailId = sent.id;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    results.push({
      invoice: i,
      customer,
      daysOverdue: days,
      draftEmail: renderDraft(i, customer, days, total, stripeUrl),
      stripeHostedInvoiceUrl: stripeUrl,
      emailId,
      errors: errors.length > 0 ? errors : undefined,
    });
  }

  return new Response(
    JSON.stringify({
      dryRun,
      count: results.length,
      totalOutstandingCents: results.reduce((sum, r) => sum + r.invoice.totalCents, 0),
      invoices: results,
    }),
    { headers: { "content-type": "application/json" } },
  );
}

function renderDraft(
  invoice: Invoice,
  customer: Customer | null,
  daysOverdue: number,
  total: string,
  stripeUrl: string | null,
): string {
  const greeting = customer ? `Hi ${customer.name},` : "Hello,";
  const payLine = stripeUrl
    ? `\n\nYou can pay online here: ${stripeUrl}`
    : "";
  return `${greeting}\n\nThis is a friendly reminder that invoice ${invoice.number} for ${invoice.currency} ${total} was due on ${invoice.dueDate} and is now ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue.${payLine}\n\nPlease let us know if you need anything to process payment.\n\nThanks!`;
}
