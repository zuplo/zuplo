import { environment } from "@zuplo/runtime";

/**
 * Postmark integration.
 *
 * Two responsibilities:
 *  1. Verify inbound webhook signatures (Postmark posts the parsed
 *     inbound email to /webhooks/postmark/inbound).
 *  2. Send transactional email via the Postmark REST API as a backup
 *     channel for outbound replies. Resend is the primary outbound
 *     channel — Postmark is offered as a drop-in replacement.
 *
 * Docs: https://postmarkapp.com/developer/api/overview
 */

const POSTMARK_API = "https://api.postmarkapp.com";

export interface PostmarkInboundEmail {
  /** Postmark message id. */
  MessageID: string;
  /** Stream the message arrived through (e.g. `inbound`). */
  MessageStream?: string;
  From: string;
  FromName?: string;
  /** Sender email (parsed). */
  FromFull?: { Email: string; Name?: string };
  To: string;
  ToFull?: Array<{ Email: string; Name?: string }>;
  Cc?: string;
  CcFull?: Array<{ Email: string; Name?: string }>;
  Subject: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  Tag?: string;
  Date: string;
  Headers?: Array<{ Name: string; Value: string }>;
  Attachments?: Array<{
    Name: string;
    ContentType: string;
    ContentLength: number;
    ContentID?: string;
  }>;
}

/**
 * Verify a Postmark inbound webhook by comparing the configured Basic Auth
 * credentials. Postmark uses HTTP Basic Auth (username + password) on the
 * webhook URL rather than HMAC. Configure in the Postmark UI under
 * Servers > Settings > Webhooks.
 */
export function verifyPostmarkWebhook(request: Request): boolean {
  const expectedUser = environment.POSTMARK_WEBHOOK_USERNAME;
  const expectedPass = environment.POSTMARK_WEBHOOK_PASSWORD;
  if (!expectedUser || !expectedPass) {
    // No credential pair configured — fail closed in production.
    return environment.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("basic ")) return false;
  const decoded = atob(auth.slice("Basic ".length).trim());
  const [user, pass] = decoded.split(":");
  return user === expectedUser && pass === expectedPass;
}

export interface PostmarkSendRequest {
  to: string;
  from?: string;
  subject: string;
  textBody?: string;
  htmlBody?: string;
  replyTo?: string;
  messageStream?: string;
  /** Postmark `Tag` for analytics. */
  tag?: string;
}

export interface PostmarkSendResponse {
  MessageID: string;
  SubmittedAt: string;
  To: string;
  ErrorCode: number;
  Message: string;
}

/**
 * Send a transactional email via Postmark.
 */
export async function sendPostmarkEmail(
  req: PostmarkSendRequest,
): Promise<PostmarkSendResponse> {
  const token = environment.POSTMARK_SERVER_TOKEN;
  if (!token) throw new Error("POSTMARK_SERVER_TOKEN is not set");
  const from = req.from ?? environment.POSTMARK_FROM_EMAIL;
  if (!from) throw new Error("POSTMARK_FROM_EMAIL is not set and no `from` provided");

  const res = await fetch(`${POSTMARK_API}/email`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "X-Postmark-Server-Token": token,
    },
    body: JSON.stringify({
      From: from,
      To: req.to,
      Subject: req.subject,
      TextBody: req.textBody,
      HtmlBody: req.htmlBody,
      ReplyTo: req.replyTo,
      MessageStream: req.messageStream ?? "outbound",
      Tag: req.tag,
    }),
  });
  if (!res.ok) {
    throw new Error(`Postmark send failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as PostmarkSendResponse;
}
