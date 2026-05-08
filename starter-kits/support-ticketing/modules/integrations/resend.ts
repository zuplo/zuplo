import { environment } from "@zuplo/runtime";

/**
 * Resend integration for transactional email.
 *
 * Used as the primary outbound channel for ticket replies. Postmark is
 * available as a drop-in alternative.
 *
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */

const RESEND_API = "https://api.resend.com";

export interface ResendEmailRequest {
  to: string | string[];
  /** Defaults to RESEND_FROM_EMAIL. */
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  /** Tag-style metadata (Resend supports `tags: [{name,value}]`). */
  tags?: Array<{ name: string; value: string }>;
}

export interface ResendResponse {
  id: string;
}

/**
 * Send an email via Resend.
 */
export async function sendResendEmail(
  req: ResendEmailRequest,
): Promise<ResendResponse> {
  const apiKey = environment.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const from = req.from ?? environment.RESEND_FROM_EMAIL;
  if (!from) throw new Error("RESEND_FROM_EMAIL is not set and no `from` provided");

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
      tags: req.tags,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ResendResponse;
}
