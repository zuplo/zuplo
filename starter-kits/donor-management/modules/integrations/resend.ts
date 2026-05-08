import { environment } from "@zuplo/runtime";

/**
 * Resend transactional email integration.
 *
 * Used for:
 *  - acknowledgement / thank-you emails after each donation (via webhook)
 *  - the year-end receipt batch (`generate_year_end_receipts`)
 *  - re-engagement emails (`identify_lapsed_donors`)
 */

const RESEND_API = "https://api.resend.com";

export interface ResendEmailRequest {
  to: string | string[];
  from: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string }[];
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
      attachments: req.attachments,
      tags: req.tags,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ResendResponse;
}

export function defaultFrom(): string {
  return environment.RESEND_FROM_EMAIL ?? "donations@example.org";
}

/**
 * Resend supports POST /emails/batch for up to 100 emails per call. Useful
 * for year-end-receipt blasts where you have a precomputed list.
 */
export async function sendResendBatch(
  emails: ResendEmailRequest[],
): Promise<{ data: ResendResponse[] }> {
  const apiKey = environment.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  if (emails.length === 0) return { data: [] };
  if (emails.length > 100) {
    throw new Error("Resend batch is capped at 100 emails per call.");
  }

  const res = await fetch(`${RESEND_API}/emails/batch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(
      emails.map((e) => ({
        to: e.to,
        from: e.from,
        subject: e.subject,
        html: e.html,
        text: e.text,
        reply_to: e.replyTo,
        tags: e.tags,
      })),
    ),
  });
  if (!res.ok) {
    throw new Error(`Resend batch failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { data: ResendResponse[] };
}
