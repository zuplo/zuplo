import { environment } from "@zuplo/runtime";

/**
 * DocuSign eSignature integration.
 *
 * Creates envelopes and lists their status via DocuSign's eSignature
 * REST API v2.1. Authenticates with an OAuth2 access token issued to a
 * DocuSign integration key — typically refreshed externally and provided
 * via `DOCUSIGN_ACCESS_TOKEN`. The kit also needs `DOCUSIGN_ACCOUNT_ID`
 * and `DOCUSIGN_BASE_URL` (e.g. `https://demo.docusign.net` for the demo
 * environment, or your account's production base URL).
 *
 * Docs: https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/envelopes/create/
 */

export interface DocuSignSigner {
  email: string;
  name: string;
  /** Sequential signing order (1-based). */
  recipientId?: string;
  /** Tabs/anchors to place. Use `signHerePlaceholder` to drop a sign-here at `\\s1\\` etc. */
  signHerePlaceholder?: string;
}

export interface DocuSignDocument {
  /** Base64-encoded document bytes. */
  documentBase64: string;
  name: string;
  /** Lowercase file extension: pdf, docx, txt, html. */
  fileExtension: string;
  documentId?: string;
}

export interface DocuSignEnvelopeRequest {
  /** Subject line of the email DocuSign sends. */
  emailSubject: string;
  emailBlurb?: string;
  documents: DocuSignDocument[];
  signers: DocuSignSigner[];
  /** Defaults to `sent` (immediate send). Pass `created` to keep it as a draft. */
  status?: "sent" | "created";
  /** Optional custom field for matter linkage. */
  customFields?: Record<string, string>;
}

export interface DocuSignEnvelopeResponse {
  envelopeId: string;
  status: string;
  statusDateTime: string;
  uri: string;
}

function envValue(name: string): string | undefined {
  return (environment as Record<string, string | undefined>)[name];
}

function requireEnv(name: string): string {
  const value = envValue(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function baseUrl(): string {
  return requireEnv("DOCUSIGN_BASE_URL").replace(/\/$/, "");
}

function accountUrl(): string {
  return `${baseUrl()}/restapi/v2.1/accounts/${encodeURIComponent(requireEnv("DOCUSIGN_ACCOUNT_ID"))}`;
}

function authHeader(): Record<string, string> {
  return { authorization: `Bearer ${requireEnv("DOCUSIGN_ACCESS_TOKEN")}` };
}

/**
 * Create an envelope. Returns the envelopeId and status.
 */
export async function createDocuSignEnvelope(
  req: DocuSignEnvelopeRequest,
): Promise<DocuSignEnvelopeResponse> {
  const url = `${accountUrl()}/envelopes`;

  const recipients = {
    signers: req.signers.map((s, i) => ({
      email: s.email,
      name: s.name,
      recipientId: s.recipientId ?? String(i + 1),
      routingOrder: String(i + 1),
      tabs: s.signHerePlaceholder
        ? {
            signHereTabs: [
              {
                anchorString: s.signHerePlaceholder,
                anchorUnits: "pixels",
                anchorXOffset: "0",
                anchorYOffset: "0",
              },
            ],
          }
        : undefined,
    })),
  };

  const body = {
    emailSubject: req.emailSubject,
    emailBlurb: req.emailBlurb,
    status: req.status ?? "sent",
    documents: req.documents.map((d, i) => ({
      documentBase64: d.documentBase64,
      name: d.name,
      fileExtension: d.fileExtension,
      documentId: d.documentId ?? String(i + 1),
    })),
    recipients,
    customFields: req.customFields
      ? {
          textCustomFields: Object.entries(req.customFields).map(
            ([name, value]) => ({ name, value, required: "false", show: "false" }),
          ),
        }
      : undefined,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeader(),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `DocuSign create envelope failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as DocuSignEnvelopeResponse;
}

/**
 * Get the status of a single envelope.
 */
export async function getDocuSignEnvelopeStatus(
  envelopeId: string,
): Promise<{ status: string; statusDateTime: string; envelopeId: string }> {
  const url = `${accountUrl()}/envelopes/${encodeURIComponent(envelopeId)}`;
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) {
    throw new Error(
      `DocuSign get envelope failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as {
    status: string;
    statusDateTime: string;
    envelopeId: string;
  };
}

/**
 * Void (cancel) an envelope. Idempotent.
 */
export async function voidDocuSignEnvelope(
  envelopeId: string,
  reason: string,
): Promise<void> {
  const url = `${accountUrl()}/envelopes/${encodeURIComponent(envelopeId)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...authHeader(), "content-type": "application/json" },
    body: JSON.stringify({ status: "voided", voidedReason: reason }),
  });
  if (!res.ok) {
    throw new Error(
      `DocuSign void envelope failed: ${res.status} ${await res.text()}`,
    );
  }
}
