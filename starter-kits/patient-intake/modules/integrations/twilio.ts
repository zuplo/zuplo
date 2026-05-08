import { environment } from "@zuplo/runtime";

/**
 * Twilio Verify integration.
 *
 * Used by the patient-intake kit to gate intake submission with a
 * one-time SMS code. The kit calls `startTwilioVerification` to send
 * the code and `checkTwilioVerification` to validate the code the
 * patient typed back. The Verify service id is provisioned in the
 * Twilio console; both functions use Basic auth with Account SID +
 * Auth Token over HTTPS.
 *
 * Docs: https://www.twilio.com/docs/verify/api
 */

const TWILIO_VERIFY_API = "https://verify.twilio.com";

function basicAuthHeader(): string {
  const sid = environment.TWILIO_ACCOUNT_SID;
  const token = environment.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
  }
  // btoa is available in the Zuplo (edge) runtime.
  return `Basic ${btoa(`${sid}:${token}`)}`;
}

export interface TwilioStartVerificationRequest {
  /** E.164 phone number, e.g. "+15551234567". */
  to: string;
  /** "sms" | "call" | "email". */
  channel?: "sms" | "call" | "email";
}

export interface TwilioVerificationResponse {
  sid: string;
  to: string;
  channel: string;
  status: "pending" | "approved" | "canceled";
  valid: boolean;
  date_created: string;
  date_updated: string;
}

/**
 * Trigger a Twilio Verify SMS / call / email for the given phone or email.
 */
export async function startTwilioVerification(
  req: TwilioStartVerificationRequest,
): Promise<TwilioVerificationResponse> {
  const serviceSid = environment.TWILIO_VERIFY_SERVICE_SID;
  if (!serviceSid) throw new Error("TWILIO_VERIFY_SERVICE_SID is not set");

  const params = new URLSearchParams();
  params.set("To", req.to);
  params.set("Channel", req.channel ?? "sms");

  const res = await fetch(
    `${TWILIO_VERIFY_API}/v2/Services/${encodeURIComponent(serviceSid)}/Verifications`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: basicAuthHeader(),
      },
      body: params.toString(),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Twilio Verify start failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as TwilioVerificationResponse;
}

export interface TwilioCheckVerificationRequest {
  to: string;
  code: string;
}

export interface TwilioCheckVerificationResponse {
  sid: string;
  to: string;
  channel: string;
  status: "pending" | "approved" | "canceled";
  valid: boolean;
}

/**
 * Validate the one-time code the patient typed back.
 */
export async function checkTwilioVerification(
  req: TwilioCheckVerificationRequest,
): Promise<TwilioCheckVerificationResponse> {
  const serviceSid = environment.TWILIO_VERIFY_SERVICE_SID;
  if (!serviceSid) throw new Error("TWILIO_VERIFY_SERVICE_SID is not set");

  const params = new URLSearchParams();
  params.set("To", req.to);
  params.set("Code", req.code);

  const res = await fetch(
    `${TWILIO_VERIFY_API}/v2/Services/${encodeURIComponent(serviceSid)}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: basicAuthHeader(),
      },
      body: params.toString(),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Twilio Verify check failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as TwilioCheckVerificationResponse;
}
