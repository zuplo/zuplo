import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { signatureEnvelopeRepository } from "../repositories/matters.ts";

/**
 * Inbound DocuSign Connect webhook.
 *
 * Receives envelope status updates (sent, delivered, signed, completed,
 * voided). DocuSign Connect signs requests with HMAC SHA-256 using a
 * shared secret configured on the Connect listener. Header is
 * `X-DocuSign-Signature-1` (base64). Configure the secret on the listener
 * in https://admindemo.docusign.com/connect (or production) and put it in
 * `DOCUSIGN_CONNECT_SECRET`.
 *
 * The handler verifies the signature, parses the JSON event, and updates
 * the matching `signature_envelopes` row's `status` and (if completed)
 * `completedAt`.
 *
 * Docs: https://developers.docusign.com/platform/webhooks/connect/
 */

interface DocuSignEnvelopeEvent {
  event: string;
  data: {
    accountId?: string;
    envelopeId: string;
    envelopeSummary?: {
      status: string;
      statusChangedDateTime?: string;
      customFields?: {
        textCustomFields?: Array<{ name: string; value: string }>;
      };
    };
    customFields?: {
      textCustomFields?: Array<{ name: string; value: string }>;
    };
  };
}

function envValue(name: string): string | undefined {
  return (environment as Record<string, string | undefined>)[name];
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function base64Encode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function verifyDocuSignSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  return constantTimeEqual(base64Encode(sig), signatureHeader);
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const secret = envValue("DOCUSIGN_CONNECT_SECRET");
  if (!secret) {
    return new Response(
      JSON.stringify({
        error: { type: "config", message: "DOCUSIGN_CONNECT_SECRET not configured" },
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
  const sigHeader = request.headers.get("x-docusign-signature-1");
  if (!sigHeader) {
    return new Response(
      JSON.stringify({
        error: { type: "unauthorized", message: "Missing X-DocuSign-Signature-1" },
      }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  const rawBody = await request.text();
  const ok = await verifyDocuSignSignature(rawBody, sigHeader, secret).catch(
    () => false,
  );
  if (!ok) {
    return new Response(
      JSON.stringify({ error: { type: "unauthorized", message: "Invalid signature" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  const event = JSON.parse(rawBody) as DocuSignEnvelopeEvent;
  const envelopeId = event.data?.envelopeId;
  const status = event.data?.envelopeSummary?.status ?? "unknown";
  const statusChanged =
    event.data?.envelopeSummary?.statusChangedDateTime ?? new Date().toISOString();

  // Pull tenantId from the customFields we set on send. We carry tenantId
  // through DocuSign so we can find the row even though webhook traffic is
  // unauthenticated.
  const fields =
    event.data?.envelopeSummary?.customFields?.textCustomFields ??
    event.data?.customFields?.textCustomFields ??
    [];
  const tenantField = fields.find((f) => f.name === "tenantId");
  const tenantId = tenantField?.value;
  if (!envelopeId || !tenantId) {
    context.log.warn(
      `[docusign] missing envelopeId or tenantId customField; event=${event.event}`,
    );
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Find the local envelope record for this tenant + envelopeId.
  const matches = await signatureEnvelopeRepository.list(tenantId, {
    where: { envelopeId },
    limit: 1,
  });
  const tracker = matches.items[0];
  if (!tracker) {
    context.log.warn(
      `[docusign] no tracker for envelopeId=${envelopeId} tenant=${tenantId}`,
    );
    return new Response(JSON.stringify({ ok: true, tracked: false }), {
      headers: { "content-type": "application/json" },
    });
  }

  const completed = status === "completed" ? statusChanged : tracker.completedAt;
  await signatureEnvelopeRepository.update(tenantId, tracker.id, {
    status,
    completedAt: completed,
  });

  return new Response(
    JSON.stringify({ ok: true, tracked: true, envelopeId, status }),
    { headers: { "content-type": "application/json" } },
  );
}
