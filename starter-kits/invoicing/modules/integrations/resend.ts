import { environment } from "@zuplo/runtime";

/**
 * Resend transactional email integration.
 *
 * Sends a single email via the public REST API. Used by chase_overdue_invoices
 * to actually send the dunning email after the LLM rewrites the draft.
 */

const RESEND_API = "https://api.resend.com";

export interface ResendEmailRequest {
  to: string | string[];
  from: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export interface ResendResponse {
  id: string;
}

export async function sendResendEmail(
  req: ResendEmailRequest,
): Promise<ResendResponse> {
  const apiKey = environment.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const res = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      to: req.to,
      from: req.from,
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

/**
 * Default `from` address for transactional email. Reads RESEND_FROM_EMAIL or
 * falls back to a placeholder so a fresh kit fails loudly.
 */
export function defaultFrom(): string {
  return environment.RESEND_FROM_EMAIL ?? "billing@example.com";
}
