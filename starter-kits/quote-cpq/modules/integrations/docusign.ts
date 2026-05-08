/**
 * DocuSign eSignature REST API integration.
 *
 * Calls DocuSign's REST API directly using a JWT-issued access token
 * (set via env). Used by `send_quote` to dispatch a quote PDF as an
 * envelope; the inbound /webhooks/docusign route handles "envelope-completed"
 * and flips the quote to status=accepted.
 *
 * Env:
 *   DOCUSIGN_BASE_URL          e.g. https://demo.docusign.net or
 *                              https://na3.docusign.net (per-account)
 *   DOCUSIGN_ACCOUNT_ID        DocuSign account GUID
 *   DOCUSIGN_ACCESS_TOKEN      Bearer token (refresh upstream — JWT grant)
 *   DOCUSIGN_WEBHOOK_HMAC_KEY  Connect HMAC key for verifying inbound calls
 */

export interface DocusignSigner {
  email: string;
  name: string;
  recipientId?: string;
  routingOrder?: string;
  /** Pre-fill tabs (signHere, dateSigned, text, etc.) — passthrough. */
  tabs?: Record<string, unknown>;
}

export interface DocusignDocument {
  /** Base64-encoded document bytes. */
  documentBase64: string;
  name: string;
  fileExtension?: string;
  documentId: string;
}

export interface CreateEnvelopeRequest {
  emailSubject: string;
  emailBlurb?: string;
  documents: DocusignDocument[];
  signers: DocusignSigner[];
  /** Custom field stored on the envelope — used to map back to a quote. */
  quoteId: string;
  /** "sent" sends immediately; "created" leaves it as a draft. */
  status?: "sent" | "created";
}

export interface DocusignEnvelopeResponse {
  envelopeId: string;
  uri: string;
  status: string;
  statusDateTime: string;
}

function authHeader(): string {
  const token = process.env.DOCUSIGN_ACCESS_TOKEN;
  if (!token) throw new Error("DOCUSIGN_ACCESS_TOKEN is not set");
  return `Bearer ${token}`;
}

function envelopesBase(): string {
  const base = process.env.DOCUSIGN_BASE_URL;
  const acct = process.env.DOCUSIGN_ACCOUNT_ID;
  if (!base) throw new Error("DOCUSIGN_BASE_URL is not set");
  if (!acct) throw new Error("DOCUSIGN_ACCOUNT_ID is not set");
  return `${base.replace(/\/$/, "")}/restapi/v2.1/accounts/${acct}`;
}

/** Create an envelope from documents + signers. */
export async function createDocusignEnvelope(
  req: CreateEnvelopeRequest,
): Promise<DocusignEnvelopeResponse> {
  const recipients = {
    signers: req.signers.map((s, idx) => ({
      email: s.email,
      name: s.name,
      recipientId: s.recipientId ?? String(idx + 1),
      routingOrder: s.routingOrder ?? "1",
      tabs: s.tabs,
    })),
  };

  const body = {
    emailSubject: req.emailSubject,
    emailBlurb: req.emailBlurb,
    status: req.status ?? "sent",
    documents: req.documents,
    recipients,
    customFields: {
      textCustomFields: [
        {
          name: "quoteId",
          value: req.quoteId,
          required: "false",
          show: "false",
        },
      ],
    },
  };

  const res = await fetch(`${envelopesBase()}/envelopes`, {
    method: "POST",
    headers: {
      authorization: authHeader(),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(
      `DocuSign envelope create failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as DocusignEnvelopeResponse;
}

/** Verify a DocuSign Connect webhook using HMAC-SHA256. */
export async function verifyDocusignWebhook(
  rawBody: string,
  signatureHeader: string,
): Promise<boolean> {
  const key = process.env.DOCUSIGN_WEBHOOK_HMAC_KEY;
  if (!key) throw new Error("DOCUSIGN_WEBHOOK_HMAC_KEY is not set");

  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    enc.encode(rawBody),
  );
  const bytes = new Uint8Array(sig);
  const expected = btoa(String.fromCharCode(...bytes));
  return timingSafeEqual(expected, signatureHeader);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
