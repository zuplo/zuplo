import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { verifyResendWebhook } from "../integrations/resend.ts";

interface ResendWebhookEvent {
  type: string;
  data: {
    email_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    tags?: Array<{ name: string; value: string }>;
  };
}

/**
 * Inbound webhook: Resend (Svix-signed).
 *
 * Verifies the Svix signature, parses the event, and logs bounce / spam-
 * complaint / opened events. Extend the switch to write to a
 * "delivery_events" table or to suppress bounced addresses from future
 * survey sends.
 *
 * Configure your Resend webhook URL: https://<gateway>/webhooks/resend
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("missing svix headers", { status: 400 });
  }

  const raw = await request.text();
  let valid = false;
  try {
    valid = await verifyResendWebhook(raw, {
      svixId,
      svixTimestamp,
      svixSignature,
    });
  } catch (err) {
    context.log.error(`Resend webhook verify error: ${(err as Error).message}`);
    return new Response("verification failed", { status: 500 });
  }
  if (!valid) {
    return new Response("invalid signature", { status: 401 });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(raw) as ResendWebhookEvent;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  switch (event.type) {
    case "email.bounced":
    case "email.complained":
      context.log.warn(
        `Resend ${event.type}: ${event.data.email_id ?? ""} to ${(event.data.to ?? []).join(",")}`,
      );
      // Extend: persist a bounce/suppression record in the kit's DB so
      // future survey sends skip this address.
      break;
    case "email.delivered":
    case "email.opened":
    case "email.clicked":
      context.log.info(`Resend ${event.type}: ${event.data.email_id ?? ""}`);
      break;
    default:
      context.log.info(`Resend event ignored: ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "content-type": "application/json" },
  });
}
