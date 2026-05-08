import { environment } from "@zuplo/runtime";

/**
 * Twilio SMS integration.
 *
 * Sends SMS messages via the Twilio Messages API using HTTP Basic auth
 * (Account SID + Auth Token). Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
 * and either `TWILIO_FROM_NUMBER` (a verified phone number, e.164) or
 * `TWILIO_MESSAGING_SERVICE_SID` (recommended for production).
 *
 * Docs: https://www.twilio.com/docs/messaging/api/message-resource
 */

const TWILIO_API = "https://api.twilio.com/2010-04-01";

export interface TwilioSmsRequest {
  /** Recipient phone number in e.164 format (e.g. `+15551234567`). */
  to: string;
  /** Body of the SMS. Twilio splits >160 chars into multiple segments. */
  body: string;
  /** Optional override for sender. */
  from?: string;
  /** Use a Twilio Messaging Service SID instead of a single from-number. */
  messagingServiceSid?: string;
  /** Optional callback URL for delivery status updates. */
  statusCallback?: string;
}

export interface TwilioMessageResponse {
  sid: string;
  status: string;
  to: string;
  from: string | null;
  body: string;
  date_created: string;
  num_segments: string;
  price: string | null;
  error_code: number | null;
  error_message: string | null;
}

function envValue(name: string): string | undefined {
  return (environment as Record<string, string | undefined>)[name];
}

function requireEnv(name: string): string {
  const value = envValue(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * Send an SMS through Twilio. Throws on non-2xx responses with the Twilio
 * error body inlined for debugging.
 */
export async function sendTwilioSms(
  req: TwilioSmsRequest,
): Promise<TwilioMessageResponse> {
  const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
  const authToken = requireEnv("TWILIO_AUTH_TOKEN");

  const messagingServiceSid =
    req.messagingServiceSid ?? envValue("TWILIO_MESSAGING_SERVICE_SID");
  const fromNumber = req.from ?? envValue("TWILIO_FROM_NUMBER");
  if (!messagingServiceSid && !fromNumber) {
    throw new Error(
      "Twilio sender is not configured: set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.",
    );
  }

  const params = new URLSearchParams();
  params.set("To", req.to);
  params.set("Body", req.body);
  if (messagingServiceSid) {
    params.set("MessagingServiceSid", messagingServiceSid);
  } else if (fromNumber) {
    params.set("From", fromNumber);
  }
  if (req.statusCallback) {
    params.set("StatusCallback", req.statusCallback);
  }

  const basic = btoa(`${accountSid}:${authToken}`);
  const url = `${TWILIO_API}/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`Twilio SMS send failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TwilioMessageResponse;
}
