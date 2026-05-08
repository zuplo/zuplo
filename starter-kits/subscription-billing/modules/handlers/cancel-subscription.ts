import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { subscriptionRepository } from "../repositories/subscriptions.ts";
import { cancelStripeSubscription, mapStripeStatus } from "../integrations/stripe.ts";

/**
 * Cancel a subscription.
 *
 * If the subscription has a `stripeSubscriptionId`, cancel in Stripe and
 * mirror the resulting status. Default Stripe cancel is at-period-end so
 * the customer keeps access for what they paid for; pass `?immediate=true`
 * to cancel and prorate now.
 */
export default async function (request: ZuploRequest, _context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const url = new URL(request.url);
  const immediate = url.searchParams.get("immediate") === "true";

  try {
    const sub = await subscriptionRepository.get(tenantId, id);

    if (sub.stripeSubscriptionId && environment.STRIPE_SECRET_KEY) {
      const stripeSub = await cancelStripeSubscription({
        stripeSubscriptionId: sub.stripeSubscriptionId,
        immediate,
      });
      const updated = await subscriptionRepository.update(tenantId, id, {
        status: mapStripeStatus(stripeSub.status, stripeSub.pause_collection),
        canceledAt: stripeSub.canceled_at
          ? new Date(stripeSub.canceled_at * 1000).toISOString()
          : new Date().toISOString(),
      });
      return new Response(JSON.stringify(updated), {
        headers: { "content-type": "application/json" },
      });
    }

    // Local-only fallback.
    const updated = await subscriptionRepository.update(tenantId, id, {
      status: "canceled",
      canceledAt: new Date().toISOString(),
    });
    return new Response(JSON.stringify(updated), {
      headers: { "content-type": "application/json" },
    });
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
