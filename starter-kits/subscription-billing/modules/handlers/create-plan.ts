import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { planRepository, type Plan } from "../repositories/subscriptions.ts";
import { createStripePlan } from "../integrations/stripe.ts";

interface Body {
  name: string;
  intervalUnit: Plan["intervalUnit"];
  priceCents: number;
  currency: string;
  includedUsage: number;
  overageRateCents: number;
}

/**
 * Create a plan.
 *
 * If STRIPE_SECRET_KEY is set, also creates a matching Stripe Product+Price
 * pair. The IDs are stored on the local Plan so create_subscription can
 * subscribe customers against the Stripe Price.
 */
export default async function (request: ZuploRequest, _context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const id = `plan_${crypto.randomUUID().slice(0, 8)}`;

  let stripePriceId: string | null = null;
  let stripeProductId: string | null = null;
  if (environment.STRIPE_SECRET_KEY) {
    const stripe = await createStripePlan({
      name: body.name,
      intervalUnit: body.intervalUnit,
      priceCents: body.priceCents,
      currency: body.currency,
      tenantPlanId: id,
    });
    stripePriceId = stripe.priceId;
    stripeProductId = stripe.productId;
  }

  const created = await planRepository.create(tenantId, {
    name: body.name,
    intervalUnit: body.intervalUnit,
    priceCents: body.priceCents,
    currency: body.currency,
    includedUsage: body.includedUsage,
    overageRateCents: body.overageRateCents,
    createdAt: new Date().toISOString(),
    stripePriceId,
    stripeProductId,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
