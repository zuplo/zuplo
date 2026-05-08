import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  customerRepository,
  planRepository,
  subscriptionRepository,
} from "../repositories/subscriptions.ts";
import {
  createStripeSubscription,
  upsertStripeCustomer,
  mapStripeStatus,
} from "../integrations/stripe.ts";

/**
 * Create a subscription.
 *
 * If STRIPE_SECRET_KEY is set, this is a thin wrapper over Stripe Billing:
 * we upsert the Stripe customer, create a Stripe subscription against the
 * plan's stripePriceId, and persist only the IDs + metadata locally.
 * Stripe owns the truth.
 *
 * If STRIPE_SECRET_KEY is NOT set, we fall back to local-only creation so
 * the kit boots zero-config for demos.
 */

interface Body {
  customerId: string;
  planId: string;
  startDate?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  trialEnd?: string | null;
  metadata?: Record<string, string>;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date();

  const customer = await customerRepository.get(tenantId, body.customerId);
  const plan = await planRepository.get(tenantId, body.planId);

  if (environment.STRIPE_SECRET_KEY) {
    if (!plan.stripePriceId) {
      return new Response(
        JSON.stringify({
          error: {
            type: "stripe_missing_price",
            message: `Plan ${plan.id} has no stripePriceId. Create the plan via /plans (which creates a Stripe Price) or set the field manually.`,
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }

    const stripeCustomer = await upsertStripeCustomer({
      email: customer.email,
      name: customer.name,
      tenantCustomerId: customer.id,
    });

    const trialEndUnix =
      body.trialEnd != null
        ? Math.floor(new Date(body.trialEnd).getTime() / 1000)
        : undefined;

    const stripeSub = await createStripeSubscription({
      stripeCustomerId: stripeCustomer.id,
      stripePriceId: plan.stripePriceId,
      trialEnd: trialEndUnix,
      metadata: {
        tenant_id: tenantId,
        tenant_customer_id: customer.id,
        tenant_plan_id: plan.id,
        ...(body.metadata ?? {}),
      },
    });

    const created = await subscriptionRepository.create(tenantId, {
      customerId: body.customerId,
      planId: body.planId,
      status: mapStripeStatus(stripeSub.status, stripeSub.pause_collection),
      startDate: body.startDate ?? now.toISOString(),
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000).toISOString(),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000).toISOString(),
      trialEnd: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
      canceledAt: null,
      createdAt: now.toISOString(),
      stripeSubscriptionId: stripeSub.id,
      stripeCustomerId: stripeCustomer.id,
      stripeItemId: stripeSub.items.data[0]?.id ?? null,
      metadata: body.metadata ?? null,
    });

    if (!customer.stripeCustomerId) {
      await customerRepository.update(tenantId, customer.id, {
        stripeCustomerId: stripeCustomer.id,
      });
    }

    return new Response(JSON.stringify(created), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }

  // Local-only fallback (zero-config demo path).
  const created = await subscriptionRepository.create(tenantId, {
    customerId: body.customerId,
    planId: body.planId,
    status: "active",
    startDate: body.startDate ?? now.toISOString(),
    currentPeriodStart: body.currentPeriodStart ?? now.toISOString(),
    currentPeriodEnd:
      body.currentPeriodEnd ??
      new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    trialEnd: body.trialEnd ?? null,
    canceledAt: null,
    createdAt: now.toISOString(),
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    stripeItemId: null,
    metadata: body.metadata ?? null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
