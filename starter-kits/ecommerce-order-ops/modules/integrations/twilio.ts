import { environment } from "@zuplo/runtime";

/**
 * Twilio Programmable SMS integration.
 *
 * Used by the e-commerce kit to send tracking links to buyers when a
 * shipment moves to `in_transit` (and exception alerts when ShipEngine
 * reports a delivery problem). The Twilio REST API uses Basic auth
 * over HTTPS — no SDK needed in the edge runtime.
 *
 * Docs: https://www.twilio.com/docs/sms/api/message-resource
 */

const TWILIO_API = "https://api.twilio.com/2010-04-01";

function authHeader(): string {
  const sid = environment.TWILIO_ACCOUNT_SID;
  const token = environment.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
  }
  return `Basic ${btoa(`${sid}:${token}`)}`;
}

export interface TwilioSendSmsRequest {
  /** E.164, e.g. "+15555550100". */
  to: string;
  body: string;
  /** Override the default From number (e.g. for a different brand). */
  from?: string;
  /** Twilio status callback URL, posted to /webhooks/twilio. */
  statusCallback?: string;
}

export interface TwilioMessageResponse {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
  date_created: string;
  date_updated: string;
  num_segments: string;
}

/**
 * Send an SMS via Twilio.
 */
export async function sendTwilioSms(
  req: TwilioSendSmsRequest,
): Promise<TwilioMessageResponse> {
  const sid = environment.TWILIO_ACCOUNT_SID;
  if (!sid) throw new Error("TWILIO_ACCOUNT_SID is not set");
  const from = req.from ?? environment.TWILIO_FROM_NUMBER;
  if (!from) throw new Error("TWILIO_FROM_NUMBER is not set");

  const params = new URLSearchParams();
  params.set("To", req.to);
  params.set("From", from);
  params.set("Body", req.body);
  if (req.statusCallback) params.set("StatusCallback", req.statusCallback);

  const res = await fetch(
    `${TWILIO_API}/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: authHeader(),
      },
      body: params.toString(),
    },
  );

  if (!res.ok) {
    throw new Error(`Twilio SMS send failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TwilioMessageResponse;
}
