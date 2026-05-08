import { environment } from "@zuplo/runtime";

/**
 * Resend transactional email integration.
 *
 * Used by the event-ticketing kit to email a QR ticket to the buyer
 * when an order moves to "paid" (either inline after PaymentIntent
 * creation succeeds, or from the Stripe webhook).
 *
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */

const RESEND_API = "https://api.resend.com";

export interface ResendEmailRequest {
  to: string | string[];
  from: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  /** Inline attachments — useful for the QR png. */
  attachments?: Array<{
    filename: string;
    /** Base64-encoded content. */
    content: string;
    contentType?: string;
  }>;
}

export interface ResendResponse {
  id: string;
}

/**
 * Send a transactional email through Resend.
 */
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
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ResendResponse;
}

/**
 * Build a public QR-image URL via Google Charts (no API key needed,
 * works in the edge runtime). For production, swap for your own QR
 * generator and embed a base64 attachment instead.
 */
export function buildQrCodeUrl(payload: string, size = 240): string {
  const encoded = encodeURIComponent(payload);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`;
}

/**
 * Render a minimal ticket email with embedded QR image.
 */
export function renderTicketEmailHtml(args: {
  attendeeName: string;
  eventName: string;
  startsAt: string;
  venue: string;
  qrPayload: string;
}): string {
  const url = buildQrCodeUrl(args.qrPayload, 280);
  return `<!doctype html>
<html><body style="font-family:system-ui,Arial,sans-serif;max-width:540px;margin:24px auto;color:#111">
  <h1 style="font-size:22px;margin:0 0 8px">You're in, ${escapeHtml(args.attendeeName)}.</h1>
  <p style="margin:0 0 16px;color:#333">
    <strong>${escapeHtml(args.eventName)}</strong><br/>
    ${escapeHtml(args.startsAt)} &middot; ${escapeHtml(args.venue)}
  </p>
  <p style="text-align:center;margin:24px 0">
    <img src="${url}" alt="Ticket QR code" width="280" height="280" />
  </p>
  <p style="color:#555;font-size:13px;line-height:1.5">
    Show this QR at the gate. Code: <code>${escapeHtml(args.qrPayload)}</code>
  </p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
