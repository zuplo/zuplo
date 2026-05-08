import { environment } from "@zuplo/runtime";

/**
 * Twilio Programmable SMS integration for the field-service kit.
 *
 * Used to text technicians their next-stop assignment after the route
 * optimizer runs, and to text customers an "on-the-way" message when
 * the tech marks a job in progress.
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
  to: string;
  body: string;
  from?: string;
}

export interface TwilioMessageResponse {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
}

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
