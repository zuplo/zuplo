import { environment } from "@zuplo/runtime";

/**
 * DocuSign eSignature REST integration.
 *
 * Used to send POs out for vendor counter-signature once the request has
 * been approved. We use a long-lived JWT user-impersonation flow in
 * production; for the kit we accept a pre-fetched DOCUSIGN_ACCESS_TOKEN to
 * keep the runtime free of crypto-heavy JWT signing. Refresh upstream.
 *
 * Docs: https://developers.docusign.com/docs/esign-rest-api/
 */

function requireToken(): string {
  const tok = environment.DOCUSIGN_ACCESS_TOKEN;
  if (!tok) throw new Error("DOCUSIGN_ACCESS_TOKEN is not set");
  return tok;
}

function requireBaseUri(): string {
  const base = environment.DOCUSIGN_BASE_URI;
  if (!base)
    throw new Error(
      "DOCUSIGN_BASE_URI is not set (e.g. https://demo.docusign.net or https://www.docusign.net)",
    );
  return base.replace(/\/+$/, "");
}

function requireAccountId(): string {
  const id = environment.DOCUSIGN_ACCOUNT_ID;
  if (!id) throw new Error("DOCUSIGN_ACCOUNT_ID is not set");
  return id;
}

interface EnvelopeSigner {
  email: string;
  name: string;
  recipientId: string;
  routingOrder: string;
  tabs?: {
    signHereTabs?: { documentId: string; pageNumber: string; xPosition: string; yPosition: string }[];
  };
}

export interface CreateEnvelopeRequest {
  /** Subject the vendor sees in their email. */
  emailSubject: string;
  /** Plain-text body. */
  emailBody?: string;
  /** Document name (will appear in the envelope). */
  documentName: string;
  /** Base64-encoded document bytes (PDF). */
  documentBase64: string;
  /** PDF, DOCX, etc. — the file extension DocuSign should recognize. */
  fileExtension: "pdf" | "docx" | "html";
  signers: { email: string; name: string }[];
  /** Free-form metadata stamped on the envelope. */
  envelopeMetadata?: Record<string, string>;
}

export interface CreateEnvelopeResponse {
  envelopeId: string;
  status: string;
  uri: string;
}

/**
 * Create + send an envelope (`status: "sent"`). Each signer gets one
 * signature anchor on page 1 by default — override `tabs` if you have a
 * specific signing-block layout.
 */
export async function sendEnvelope(
  req: CreateEnvelopeRequest,
): Promise<CreateEnvelopeResponse> {
  const token = requireToken();
  const account = requireAccountId();
  const base = requireBaseUri();

  const recipients = req.signers.map((s, i) => {
    const r: EnvelopeSigner = {
      email: s.email,
      name: s.name,
      recipientId: String(i + 1),
      routingOrder: String(i + 1),
      tabs: {
        signHereTabs: [
          {
            documentId: "1",
            pageNumber: "1",
            xPosition: "100",
            yPosition: "150",
          },
        ],
      },
    };
    return r;
  });

  const body = {
    emailSubject: req.emailSubject,
    emailBlurb: req.emailBody,
    documents: [
      {
        documentId: "1",
        name: req.documentName,
        fileExtension: req.fileExtension,
        documentBase64: req.documentBase64,
      },
    ],
    recipients: { signers: recipients },
    customFields: req.envelopeMetadata
      ? {
          textCustomFields: Object.entries(req.envelopeMetadata).map(([name, value]) => ({
            name,
            value,
            required: "false",
            show: "false",
          })),
        }
      : undefined,
    status: "sent",
  };

  const res = await fetch(
    `${base}/restapi/v2.1/accounts/${account}/envelopes`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`DocuSign envelope create failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as CreateEnvelopeResponse;
}

/** Look up the current status of an envelope. */
export async function getEnvelope(envelopeId: string): Promise<{
  envelopeId: string;
  status: "created" | "sent" | "delivered" | "completed" | "declined" | "voided";
  statusChangedDateTime: string;
}> {
  const res = await fetch(
    `${requireBaseUri()}/restapi/v2.1/accounts/${requireAccountId()}/envelopes/${envelopeId}`,
    {
      headers: { authorization: `Bearer ${requireToken()}` },
    },
  );
  if (!res.ok) {
    throw new Error(`DocuSign envelope get failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as {
    envelopeId: string;
    status: "created" | "sent" | "delivered" | "completed" | "declined" | "voided";
    statusChangedDateTime: string;
  };
}
