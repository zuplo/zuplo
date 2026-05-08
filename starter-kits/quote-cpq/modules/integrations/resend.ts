/**
 * Resend integration — transactional email send.
 *
 * Used by `send_quote` to email the customer a link to the quote PDF /
 * portal, and by orchestrators that fire reminder emails to AE / customer.
 *
 * Env:
 *   RESEND_API_KEY      Bearer token from resend.com/api-keys
 *   RESEND_FROM_EMAIL   Default sender (e.g. quotes@yourdomain.com)
 */

const RESEND_API = "https://api.resend.com";

export interface ResendEmailRequest {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  /** Optional override of RESEND_FROM_EMAIL. */
  from?: string;
}

export interface ResendResponse {
  id: string;
}

export async function sendResendEmail(
  req: ResendEmailRequest,
): Promise<ResendResponse> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const from = req.from ?? process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error("RESEND_FROM_EMAIL is not set");

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
    throw new Error(
      `Resend send failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as ResendResponse;
}
