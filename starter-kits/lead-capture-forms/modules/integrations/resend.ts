import { environment } from "@zuplo/runtime";

/**
 * Resend integration — sends transactional email via the Resend HTTP API.
 * Used by the lead-capture-forms kit to send a confirmation email back to
 * the submitter when a new form submission is recorded.
 *
 * Env vars:
 *   RESEND_API_KEY    — Resend secret API key
 *   RESEND_FROM_EMAIL — verified "from" address (e.g. "Zuplo <hello@zuplo.com>")
 *   RESEND_REPLY_TO   — optional reply-to (sales inbox, etc.)
 */

const RESEND_API = "https://api.resend.com";

export interface ResendEmailRequest {
  to: string | string[];
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface ResendResponse {
  id: string;
}

/**
 * Send a transactional email through Resend. Throws on non-2xx — caller
 * decides whether to retry or fan out to a dead-letter queue.
 */
export async function sendResendEmail(
  req: ResendEmailRequest,
): Promise<ResendResponse> {
  const env = environment as Record<string, string | undefined>;
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  const from = req.from ?? env.RESEND_FROM_EMAIL;
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
      reply_to: req.replyTo ?? env.RESEND_REPLY_TO,
      tags: req.tags,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ResendResponse;
}

/**
 * Build a confirmation email for a form submitter. Plain-text + HTML so it
 * lands well in any client. The contents are intentionally generic — kits
 * are free to swap in branded HTML or call Claude to personalize.
 */
export function buildSubmissionConfirmation(args: {
  to: string;
  formName: string;
  replyTo?: string;
}): ResendEmailRequest {
  const { to, formName, replyTo } = args;
  return {
    to,
    subject: `We got your message — ${formName}`,
    text:
      `Thanks for reaching out via ${formName}. We received your submission and ` +
      `someone from our team will be in touch shortly.\n\n` +
      `If this wasn't you, you can ignore this email.`,
    html:
      `<p>Thanks for reaching out via <strong>${escapeHtml(formName)}</strong>.</p>` +
      `<p>We received your submission and someone from our team will be in touch shortly.</p>` +
      `<p style="color:#666; font-size: 12px;">If this wasn't you, you can ignore this email.</p>`,
    replyTo,
    tags: [{ name: "kit", value: "lead-capture-forms" }],
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Verify a Resend webhook signature (Svix-format). Returns true if the body
 * was signed by RESEND_WEBHOOK_SECRET. Resend uses Svix-compatible headers:
 *   svix-id        — message id
 *   svix-timestamp — unix seconds
 *   svix-signature — space-separated `v1,<base64hmac>` entries
 */
export async function verifyResendSignature(args: {
  rawBody: string;
  headers: Headers;
}): Promise<boolean> {
  const env = environment as Record<string, string | undefined>;
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;
  const svixId = args.headers.get("svix-id");
  const svixTimestamp = args.headers.get("svix-timestamp");
  const svixSig = args.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSig) return false;

  // Resend signing-key format: whsec_<base64>
  const keyB64 = secret.replace(/^whsec_/, "");
  const keyBytes = base64Decode(keyB64);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const message = `${svixId}.${svixTimestamp}.${args.rawBody}`;
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message),
  );
  const expected = base64Encode(new Uint8Array(sigBuf));
  // svix-signature is space-separated `v1,<sig>` pairs.
  const provided = svixSig.split(" ").map((p) => p.split(",")[1]).filter(Boolean);
  return provided.includes(expected);
}

function base64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
