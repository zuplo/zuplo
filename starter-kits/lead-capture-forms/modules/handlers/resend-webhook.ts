import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { verifyResendSignature } from "../integrations/resend.ts";

/**
 * Inbound webhook handler for Resend events. Verifies the Svix-style
 * signature (set RESEND_WEBHOOK_SECRET) and processes the event type.
 *
 * Common event types:
 *   email.delivered, email.delivery_delayed, email.bounced, email.complained,
 *   email.opened, email.clicked
 *
 * For bounce/complaint events we mark the submitter address so future sends
 * can be skipped. The kit ships with a no-op suppression hook — wire it to
 * your CRM or DB as needed.
 */
interface ResendEvent {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    [key: string]: unknown;
  };
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const rawBody = await request.text();
  const verified = await verifyResendSignature({
    rawBody,
    headers: request.headers,
  });
  if (!verified) {
    context.log.warn("Resend webhook signature verification failed");
    return new Response(
      JSON.stringify({ error: { type: "invalid_signature" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return new Response(
      JSON.stringify({ error: { type: "invalid_body" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  switch (event.type) {
    case "email.bounced":
    case "email.complained": {
      const recipients = event.data.to ?? [];
      context.log.warn(`Resend ${event.type}`, {
        email_id: event.data.email_id,
        to: recipients,
      });
      // Hook: suppress future sends to these addresses (CRM update, DB row, etc.)
      break;
    }
    case "email.delivered":
    case "email.delivery_delayed":
    case "email.opened":
    case "email.clicked": {
      context.log.info(`Resend ${event.type}`, { email_id: event.data.email_id });
      break;
    }
    default:
      context.log.info(`Resend unhandled event ${event.type}`);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
