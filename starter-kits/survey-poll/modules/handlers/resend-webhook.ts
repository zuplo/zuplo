import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";

/**
 * Inbound Resend webhook.
 *
 * Resend signs webhooks with Svix. The signature is in the
 * `svix-signature` header — to verify, HMAC-SHA256 the
 * `${svix-id}.${svix-timestamp}.${rawBody}` string with the secret bytes
 * (base64-decoded) and compare in constant time. If `RESEND_WEBHOOK_SECRET`
 * is unset the handler refuses the request.
 *
 * Supported events (free-form — extend as needed):
 *   - email.delivered, email.bounced, email.complained
 *   - email.opened, email.clicked
 *
 * Docs: https://resend.com/docs/dashboard/webhooks/introduction
 */

interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    to?: string[] | string;
    from?: string;
    subject?: string;
    bounce?: { type: string; subType: string; message: string };
  };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function base64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64Encode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function verifySvixSignature(
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string,
): Promise<boolean> {
  // Svix secret format: `whsec_<base64>` — strip the prefix.
  const cleaned = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const keyBytes = base64Decode(cleaned);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const toSign = new TextEncoder().encode(
    `${svixId}.${svixTimestamp}.${rawBody}`,
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, toSign);
  const ours = base64Encode(sigBuf);

  // Header is space-separated `v1,<sig> v1,<sig2>` — compare against any.
  for (const part of svixSignature.split(" ")) {
    const [, sig] = part.split(",");
    if (sig && constantTimeEqual(sig, ours)) return true;
  }
  return false;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const secret = (environment as Record<string, string | undefined>)
    .RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return new Response(
      JSON.stringify({ error: { type: "config", message: "RESEND_WEBHOOK_SECRET not configured" } }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response(
      JSON.stringify({ error: { type: "unauthorized", message: "Missing svix-* headers" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  const rawBody = await request.text();
  const ok = await verifySvixSignature(
    rawBody,
    svixId,
    svixTimestamp,
    svixSignature,
    secret,
  ).catch(() => false);
  if (!ok) {
    return new Response(
      JSON.stringify({ error: { type: "unauthorized", message: "Invalid signature" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  const event = JSON.parse(rawBody) as ResendWebhookEvent;

  // Domain dispatch — extend as needed. For now we only log.
  switch (event.type) {
    case "email.bounced":
      context.log.warn(
        `[resend] bounce: ${event.data?.bounce?.type ?? "?"}/${event.data?.bounce?.subType ?? "?"} for email_id=${event.data?.email_id ?? "?"}`,
      );
      break;
    case "email.complained":
      context.log.warn(
        `[resend] complaint for email_id=${event.data?.email_id ?? "?"}`,
      );
      break;
    default:
      context.log.info(`[resend] event ${event.type}`);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}
