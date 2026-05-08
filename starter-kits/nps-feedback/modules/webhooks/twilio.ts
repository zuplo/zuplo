import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { verifyTwilioWebhook } from "../integrations/twilio.ts";

/**
 * Inbound webhook: Twilio status callback.
 *
 * Twilio POSTs URL-encoded form params (MessageSid, MessageStatus,
 * ErrorCode, etc.) when an SMS state changes (queued → sent → delivered
 * or failed). Verify with `X-Twilio-Signature`, then log / persist.
 *
 * Wire this URL into the Twilio API call's StatusCallback field — see
 * `modules/handlers/send-survey.ts` for the wiring point.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const sig = request.headers.get("x-twilio-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  // Twilio sends form-encoded bodies. We need the raw text + the params
  // map for signature verification.
  const raw = await request.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<
    string,
    string
  >;

  // Reconstruct the full URL Twilio used to compute the signature.
  // Prefer X-Forwarded-* headers when behind a proxy.
  const proto =
    request.headers.get("x-forwarded-proto") ??
    new URL(request.url).protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const fullUrl = host
    ? `${proto}://${host}${new URL(request.url).pathname}${new URL(request.url).search}`
    : request.url;

  let valid = false;
  try {
    valid = await verifyTwilioWebhook(fullUrl, params, sig);
  } catch (err) {
    context.log.error(`Twilio webhook verify error: ${(err as Error).message}`);
    return new Response("verification failed", { status: 500 });
  }
  if (!valid) {
    return new Response("invalid signature", { status: 401 });
  }

  const messageSid = params.MessageSid ?? params.SmsSid;
  const status = params.MessageStatus ?? params.SmsStatus;
  const errorCode = params.ErrorCode;

  if (status === "failed" || status === "undelivered") {
    context.log.warn(
      `Twilio SMS ${messageSid} ${status} (errorCode=${errorCode ?? ""})`,
    );
    // Extend: persist a delivery failure record so a downstream task can
    // retry via email or call.
  } else {
    context.log.info(`Twilio SMS ${messageSid} -> ${status}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "content-type": "application/json" },
  });
}
