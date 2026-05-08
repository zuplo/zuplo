import { environment } from "@zuplo/runtime";

/**
 * Twilio SMS integration for status-page subscribers who opt into text alerts.
 *
 * Uses the Twilio Programmable Messaging REST API with HTTP Basic Auth
 * (Account SID + Auth Token). Edge-friendly: no Node SDK needed.
 *
 * Docs: https://www.twilio.com/docs/messaging/api/message-resource
 */

export interface SendSmsRequest {
  /** E.164 phone number (e.g. +14155551212). */
  to: string;
  body: string;
  /** Override the `from` per call. Defaults to TWILIO_FROM_NUMBER. */
  from?: string;
}

export interface SendSmsResponse {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
  errorCode: number | null;
  errorMessage: string | null;
}

/** Send an SMS via Twilio. */
export async function sendTwilioSms(req: SendSmsRequest): Promise<SendSmsResponse> {
  const accountSid = environment.TWILIO_ACCOUNT_SID;
  const authToken = environment.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required");
  }
  const from = req.from ?? environment.TWILIO_FROM_NUMBER;
  if (!from) throw new Error("TWILIO_FROM_NUMBER is not set and no `from` provided");

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const params = new URLSearchParams({
    To: req.to,
    From: from,
    Body: req.body,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!res.ok) {
    throw new Error(`Twilio SMS failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    sid: string;
    status: string;
    to: string;
    from: string;
    body: string;
    error_code: number | null;
    error_message: string | null;
  };
  return {
    sid: json.sid,
    status: json.status,
    to: json.to,
    from: json.from,
    body: json.body,
    errorCode: json.error_code,
    errorMessage: json.error_message,
  };
}
