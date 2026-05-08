import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { quoteRepository } from "../repositories/quotes.ts";
import { lineItemRepository } from "../repositories/line-items.ts";
import {
  addStripeInvoiceItem,
  createAndFinalizeStripeInvoice,
  getOrCreateStripeCustomer,
} from "../integrations/stripe.ts";
import { sendResendEmail } from "../integrations/resend.ts";

interface Body {
  /** Customer email — required for Stripe invoice. */
  customerEmail?: string;
  /** Customer display name. */
  customerName?: string;
  /** When false, skip Stripe invoice generation. Defaults to true if STRIPE_SECRET_KEY is set. */
  invoiceCustomer?: boolean;
  /** Optional override of "days until due". */
  daysUntilDue?: number;
}

/**
 * Mark a quote accepted and (optionally) issue a Stripe invoice.
 *
 * When STRIPE_SECRET_KEY is set and `invoiceCustomer !== false`, this:
 *   1. Looks up / creates the Stripe customer by email
 *   2. Adds one invoice item per line on the quote
 *   3. Creates and finalizes the invoice
 *   4. Optionally emails the buyer the hosted invoice URL via Resend
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json().catch(() => ({}))) as Body;

  try {
    const quote = await quoteRepository.update(tenantId, id, {
      status: "accepted",
      acceptedAt: new Date().toISOString(),
    });

    let stripeInvoiceId: string | undefined;
    let hostedInvoiceUrl: string | null | undefined;
    const wantsInvoice =
      body.invoiceCustomer !== false && !!process.env.STRIPE_SECRET_KEY;

    if (wantsInvoice && body.customerEmail) {
      const customer = await getOrCreateStripeCustomer(
        body.customerEmail,
        body.customerName,
      );

      // Pull line items belonging to this quote.
      const lineItems = [];
      let cursor: string | null | undefined;
      do {
        const page = await lineItemRepository.list(tenantId, {
          limit: 200,
          cursor: cursor ?? undefined,
        });
        for (const li of page.items) {
          if (li.quoteId === id) lineItems.push(li);
        }
        cursor = page.nextCursor;
      } while (cursor);

      for (const li of lineItems) {
        await addStripeInvoiceItem(
          customer.id,
          li.totalCents,
          quote.currency.toLowerCase(),
          `${li.productId} (qty ${li.quantity})`,
        );
      }

      const invoice = await createAndFinalizeStripeInvoice(customer.id, {
        daysUntilDue: body.daysUntilDue ?? 30,
      });
      stripeInvoiceId = invoice.id;
      hostedInvoiceUrl = invoice.hosted_invoice_url;

      // Optional polish: email the buyer.
      if (process.env.RESEND_API_KEY && hostedInvoiceUrl) {
        await sendResendEmail({
          to: body.customerEmail,
          subject: `Your invoice for quote ${id}`,
          html: `<p>Thanks for accepting quote ${id}. Your invoice is ready: <a href="${hostedInvoiceUrl}">view invoice</a>.</p>`,
        }).catch((err) =>
          context.log.warn(`Resend invoice email failed: ${err.message}`),
        );
      }
    }

    return new Response(
      JSON.stringify({ ...quote, stripeInvoiceId, hostedInvoiceUrl }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: err.message } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }
}
