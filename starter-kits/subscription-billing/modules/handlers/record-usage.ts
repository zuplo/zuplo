import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  subscriptionRepository,
  usageRepository,
} from "../repositories/subscriptions.ts";
import { recordStripeUsage } from "../integrations/stripe.ts";

interface Body {
  subscriptionId: string;
  quantity: number;
  recordedAt: string;
  periodStart: string;
  periodEnd: string;
}

/**
 * Record a usage event.
 *
 * If the subscription has a `stripeItemId`, also push the usage to Stripe so
 * Stripe can compute overages at period end. The local row is the audit log;
 * Stripe is the billing engine.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  let stripeUsageRecordId: string | null = null;
  if (environment.STRIPE_SECRET_KEY) {
    try {
      const sub = await subscriptionRepository.get(tenantId, body.subscriptionId);
      if (sub.stripeItemId) {
        const rec = await recordStripeUsage({
          subscriptionItemId: sub.stripeItemId,
          quantity: body.quantity,
          timestamp: Math.floor(new Date(body.recordedAt).getTime() / 1000),
        });
        stripeUsageRecordId = rec.id;
      }
    } catch (err) {
      // Non-fatal: still record locally so we have an audit trail.
      context.log.error(
        `record_usage: stripe push failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const created = await usageRepository.create(tenantId, {
    subscriptionId: body.subscriptionId,
    quantity: body.quantity,
    recordedAt: body.recordedAt,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    createdAt: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({ ...created, stripeUsageRecordId }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
