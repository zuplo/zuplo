import { environment } from "@zuplo/runtime";

/**
 * Resend integration.
 *
 * Sends transactional email via the Resend REST API
 * (https://resend.com/docs/api-reference/emails/send-email). Reads
 * RESEND_API_KEY for auth and RESEND_FROM_EMAIL for the default From address
 * if the caller doesn't supply one.
 */

const RESEND_API = "https://api.resend.com";

export interface ResendEmailRequest {
  to: string | string[];
  /** Defaults to RESEND_FROM_EMAIL if not provided. */
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

export interface ResendEmailResponse {
  id: string;
}

function envVar(name: string): string | undefined {
  return (environment as Record<string, string | undefined>)[name];
}

/**
 * Send a transactional email via Resend. Throws on missing credentials or
 * non-2xx response.
 */
export async function sendResendEmail(
  req: ResendEmailRequest,
): Promise<ResendEmailResponse> {
  const apiKey = envVar("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const from = req.from ?? envVar("RESEND_FROM_EMAIL");
  if (!from) {
    throw new Error(
      "Resend send: from address required (pass req.from or set RESEND_FROM_EMAIL).",
    );
  }

  const res = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      to: req.to,
      from,
      subject: req.subject,
      html: req.html,
      text: req.text,
      reply_to: req.replyTo,
      cc: req.cc,
      bcc: req.bcc,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ResendEmailResponse;
}
