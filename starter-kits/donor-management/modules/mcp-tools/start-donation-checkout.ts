import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { donorRepository } from "../repositories/donors.ts";
import {
  createDonationCheckoutSession,
  createRecurringGiftCheckoutSession,
} from "../integrations/stripe.ts";

/**
 * Orchestrator MCP tool: start_donation_checkout.
 *
 * Creates a Stripe Checkout Session for a donor and returns the hosted URL
 * the donor should land on. The webhook records the donation (or recurring
 * gift) when payment succeeds.
 */

interface Body {
  donorId: string;
  amountCents: number;
  currency?: string;
  campaignId?: string;
  recurring?: boolean;
  successUrl?: string;
  cancelUrl?: string;
}

export default async function (request: ZuploRequest, _context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const donor = await donorRepository.get(tenantId, body.donorId);
  const currency = body.currency ?? "USD";
  const successUrl =
    body.successUrl ?? "https://example.org/donate/thanks?session={CHECKOUT_SESSION_ID}";
  const cancelUrl = body.cancelUrl ?? "https://example.org/donate";

  if (body.recurring) {
    const session = await createRecurringGiftCheckoutSession({
      amountCents: body.amountCents,
      currency,
      donorEmail: donor.email,
      successUrl,
      cancelUrl,
      metadata: {
        tenant_id: tenantId,
        donor_id: donor.id,
        campaign_id: body.campaignId ?? "",
      },
    });
    return new Response(
      JSON.stringify({
        sessionId: session.id,
        url: session.url,
        recurring: true,
      }),
      { headers: { "content-type": "application/json" } },
    );
  }

  const session = await createDonationCheckoutSession({
    amountCents: body.amountCents,
    currency,
    donorEmail: donor.email,
    successUrl,
    cancelUrl,
    metadata: {
      tenant_id: tenantId,
      donor_id: donor.id,
      campaign_id: body.campaignId ?? "",
    },
  });

  return new Response(
    JSON.stringify({
      sessionId: session.id,
      url: session.url,
      recurring: false,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
