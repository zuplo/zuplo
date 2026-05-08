import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { subscriptionRepository } from "../repositories/subscriptions.ts";
import { pauseStripeSubscription, mapStripeStatus } from "../integrations/stripe.ts";

/**
 * Pause a subscription.
 *
 * If we have a Stripe id and the secret key is set, pause collection in
 * Stripe (keeps the subscription `active` from Stripe's POV but stops
 * billing). Otherwise fall back to flipping local status only.
 */
export default async function (request: ZuploRequest, _context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;

  try {
    const sub = await subscriptionRepository.get(tenantId, id);
    if (sub.stripeSubscriptionId && environment.STRIPE_SECRET_KEY) {
      const stripeSub = await pauseStripeSubscription(sub.stripeSubscriptionId);
      const updated = await subscriptionRepository.update(tenantId, id, {
        status: mapStripeStatus(stripeSub.status, stripeSub.pause_collection),
      });
      return new Response(JSON.stringify(updated), {
        headers: { "content-type": "application/json" },
      });
    }

    const updated = await subscriptionRepository.update(tenantId, id, {
      status: "paused",
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
