/**
 * Twilio integration — SMS survey delivery + delivery-status webhook
 * verification.
 *
 * Twilio uses HTTP basic auth with Account SID and Auth Token. SMS
 * delivery requires `application/x-www-form-urlencoded`. The status
 * webhook (configured per-message via StatusCallback URL) is verified
 * with HMAC-SHA1 against `X-Twilio-Signature`.
 *
 * Env:
 *   TWILIO_ACCOUNT_SID    Account SID (AC...)
 *   TWILIO_AUTH_TOKEN     Auth token used for both API auth and webhook signing
 *   TWILIO_FROM_NUMBER    Sender (E.164, e.g. +15551234567) or messaging service SID
 */

export interface TwilioSendSmsRequest {
  to: string;
  body: string;
  /** Optional override of TWILIO_FROM_NUMBER. */
  from?: string;
  /** Twilio will POST status updates here. Recommended: /webhooks/twilio. */
  statusCallback?: string;
}

export interface TwilioMessageResponse {
  sid: string;
  status: string;
  to: string;
  from: string;
}

function basicAuth(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid) throw new Error("TWILIO_ACCOUNT_SID is not set");
  if (!token) throw new Error("TWILIO_AUTH_TOKEN is not set");
  return `Basic ${btoa(`${sid}:${token}`)}`;
}

/** Send a text message via Twilio's Messages resource. */
export async function sendTwilioSms(
  req: TwilioSendSmsRequest,
): Promise<TwilioMessageResponse> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!sid) throw new Error("TWILIO_ACCOUNT_SID is not set");
  const from = req.from ?? process.env.TWILIO_FROM_NUMBER;
  if (!from) throw new Error("TWILIO_FROM_NUMBER is not set");

  const params = new URLSearchParams({ To: req.to, Body: req.body });
  // Twilio decides "From" vs. "MessagingServiceSid" by prefix.
  if (from.startsWith("MG")) {
    params.set("MessagingServiceSid", from);
  } else {
    params.set("From", from);
  }
  if (req.statusCallback) params.set("StatusCallback", req.statusCallback);

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: basicAuth(),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );
  if (!res.ok) {
    throw new Error(
      `Twilio SMS send failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as TwilioMessageResponse;
}

/**
 * Verify a Twilio webhook signature.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * Twilio computes HMAC-SHA1 over (full URL + sorted-key=value pairs),
 * base64-encodes it, and sends as `X-Twilio-Signature`.
 */
export async function verifyTwilioWebhook(
  fullUrl: string,
  formParams: Record<string, string>,
  signatureHeader: string,
): Promise<boolean> {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) throw new Error("TWILIO_AUTH_TOKEN is not set");

  const keys = Object.keys(formParams).sort();
  let payload = fullUrl;
  for (const k of keys) payload += k + formParams[k];

  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(payload));
  const expected = btoa(
    String.fromCharCode(...Array.from(new Uint8Array(sig))),
  );

  return timingSafeEqual(expected, signatureHeader);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}
