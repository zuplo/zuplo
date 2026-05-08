/**
 * Resend integration — survey delivery + bounce signal handling.
 *
 * Used by `send_survey` to email NPS surveys, and (paired with the
 * /webhooks/resend route) to capture bounces and flip the response /
 * follow-up record state.
 *
 * Env:
 *   RESEND_API_KEY               Bearer token from resend.com/api-keys
 *   RESEND_FROM_EMAIL            Default sender (e.g. surveys@yourdomain.com)
 *   RESEND_WEBHOOK_SIGNING_SECRET  HMAC secret for verifying inbound bounce
 *                                  events (svix-signature)
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
  /** Custom tags / metadata for downstream attribution. */
  tags?: Array<{ name: string; value: string }>;
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
      tags: req.tags,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Resend send failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as ResendResponse;
}

/**
 * Verify a Resend webhook (powered by Svix) using svix-id, svix-timestamp,
 * and svix-signature headers. https://resend.com/docs/dashboard/webhooks/introduction
 *
 * The signature value is `v1,<base64-hmac>` (or multiple comma-separated
 * versions); we accept any matching v1.
 */
export async function verifyResendWebhook(
  rawBody: string,
  headers: { svixId: string; svixTimestamp: string; svixSignature: string },
): Promise<boolean> {
  const secret = process.env.RESEND_WEBHOOK_SIGNING_SECRET;
  if (!secret) throw new Error("RESEND_WEBHOOK_SIGNING_SECRET is not set");

  // Resend / Svix secrets are prefixed with "whsec_" — strip and base64-decode.
  const stripped = secret.replace(/^whsec_/, "");
  const keyBytes = Uint8Array.from(atob(stripped), (c) => c.charCodeAt(0));

  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = `${headers.svixId}.${headers.svixTimestamp}.${rawBody}`;
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    enc.encode(data),
  );
  const expected = btoa(
    String.fromCharCode(...Array.from(new Uint8Array(sig))),
  );

  // Header may contain "v1,<sig> v1,<sig2>" — match any.
  const parts = headers.svixSignature.split(/\s+/);
  return parts.some((p) => {
    const [version, value] = p.split(",");
    return version === "v1" && value === expected;
  });
}
