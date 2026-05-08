import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { verifyStripeWebhook } from "../integrations/stripe.ts";

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Inbound webhook: Stripe events.
 *
 * Verifies `stripe-signature` against STRIPE_WEBHOOK_SIGNING_SECRET, then
 * dispatches the event by `type`. We only care about a few events here —
 * extend the switch to fold more flows in.
 *
 * Configure your Stripe webhook URL: https://<gateway>/webhooks/stripe
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  const raw = await request.text();
  const verify = await verifyStripeWebhook(raw, sig);
  if (!verify.ok) {
    return new Response(`invalid signature: ${verify.reason}`, { status: 401 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  switch (event.type) {
    case "invoice.paid": {
      // The buyer paid the Stripe invoice we issued on quote acceptance.
      // Fold this into your downstream system — pinging Slack, kicking off
      // provisioning, etc. For the kit, just log and acknowledge.
      const invoice = event.data.object as { id: string; customer: string };
      context.log.info(
        `Stripe invoice paid: ${invoice.id} for customer ${invoice.customer}`,
      );
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as { id: string; customer: string };
      context.log.warn(
        `Stripe invoice payment failed: ${invoice.id} for customer ${invoice.customer}`,
      );
      break;
    }
    default:
      context.log.info(`Stripe event ignored: ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "content-type": "application/json" },
  });
}
