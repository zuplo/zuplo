import { environment } from "@zuplo/runtime";

/**
 * Resend integration.
 *
 * Sends transactional email via the Resend REST API. Authenticates with
 * `RESEND_API_KEY`. The default `from` address falls back to
 * `RESEND_FROM_EMAIL`.
 *
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */

const RESEND_API = "https://api.resend.com";

export interface ResendEmailRequest {
  to: string | string[];
  /** Defaults to env `RESEND_FROM_EMAIL`. */
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  headers?: Record<string, string>;
  /** Idempotency key — Resend dedupes identical sends within 24h. */
  idempotencyKey?: string;
}

export interface ResendResponse {
  id: string;
}

function envValue(name: string): string | undefined {
  return (environment as Record<string, string | undefined>)[name];
}

/**
 * Send a single email through Resend. Throws on non-2xx responses with
 * the Resend error body inlined for debugging.
 */
export async function sendResendEmail(
  req: ResendEmailRequest,
): Promise<ResendResponse> {
  const apiKey = envValue("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const from = req.from ?? envValue("RESEND_FROM_EMAIL");
  if (!from) {
    throw new Error("Missing `from`: pass req.from or set RESEND_FROM_EMAIL.");
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (req.idempotencyKey) {
    headers["Idempotency-Key"] = req.idempotencyKey;
  }

  const res = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      to: req.to,
      from,
      subject: req.subject,
      html: req.html,
      text: req.text,
      reply_to: req.replyTo,
      cc: req.cc,
      bcc: req.bcc,
      headers: req.headers,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ResendResponse;
}
