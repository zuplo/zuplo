import { environment } from "@zuplo/runtime";

/**
 * DocuSign eSignature REST integration (consent forms).
 *
 * Creates an envelope from a template, adds the patient as a signer, and
 * returns the signing URL the front desk can hand to the patient on a
 * tablet (embedded signing). Used to capture HIPAA consent, financial
 * responsibility, and treatment-authorization signatures.
 *
 * The kit assumes you've configured a JWT integration in DocuSign and
 * pre-fetched an access token (token refresh happens upstream — Zuplo
 * is edge-only and stateless). Set DOCUSIGN_ACCESS_TOKEN in env.
 *
 * Docs: https://developers.docusign.com/docs/esign-rest-api/
 */

export interface DocuSignSendEnvelopeRequest {
  /** DocuSign account id. */
  accountId: string;
  /** Template id pre-built in DocuSign (e.g. HIPAA consent). */
  templateId: string;
  /** Patient who needs to sign. */
  signer: {
    name: string;
    email: string;
    /** The role name configured on the template, e.g. "Patient". */
    roleName: string;
    /** Embedded signing requires a clientUserId. */
    clientUserId?: string;
  };
  /** Optional template field values (tabs) to pre-fill. */
  prefill?: Record<string, string>;
  /** Email subject sent to the signer. */
  emailSubject?: string;
}

export interface DocuSignEnvelopeResponse {
  envelopeId: string;
  uri: string;
  statusDateTime: string;
  status: string;
}

/**
 * Create + send an envelope from a template.
 */
export async function sendDocuSignEnvelope(
  req: DocuSignSendEnvelopeRequest,
): Promise<DocuSignEnvelopeResponse> {
  const accessToken = environment.DOCUSIGN_ACCESS_TOKEN;
  const baseUrl =
    environment.DOCUSIGN_BASE_URL ?? "https://demo.docusign.net/restapi";
  if (!accessToken) throw new Error("DOCUSIGN_ACCESS_TOKEN is not set");

  const tabs = Object.entries(req.prefill ?? {}).map(([tabLabel, value]) => ({
    tabLabel,
    value,
  }));

  const payload = {
    templateId: req.templateId,
    templateRoles: [
      {
        email: req.signer.email,
        name: req.signer.name,
        roleName: req.signer.roleName,
        clientUserId: req.signer.clientUserId,
        tabs: tabs.length > 0 ? { textTabs: tabs } : undefined,
      },
    ],
    emailSubject: req.emailSubject ?? "Please sign your intake forms",
    status: "sent",
  };

  const res = await fetch(
    `${baseUrl}/v2.1/accounts/${encodeURIComponent(req.accountId)}/envelopes`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    throw new Error(
      `DocuSign envelope creation failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as DocuSignEnvelopeResponse;
}

export interface DocuSignRecipientViewRequest {
  accountId: string;
  envelopeId: string;
  signer: {
    name: string;
    email: string;
    clientUserId: string;
  };
  /** URL DocuSign will redirect the signer to after signing. */
  returnUrl: string;
}

export interface DocuSignRecipientViewResponse {
  url: string;
}

/**
 * Generate the embedded-signing URL for a recipient.
 */
export async function getDocuSignSigningUrl(
  req: DocuSignRecipientViewRequest,
): Promise<DocuSignRecipientViewResponse> {
  const accessToken = environment.DOCUSIGN_ACCESS_TOKEN;
  const baseUrl =
    environment.DOCUSIGN_BASE_URL ?? "https://demo.docusign.net/restapi";
  if (!accessToken) throw new Error("DOCUSIGN_ACCESS_TOKEN is not set");

  const res = await fetch(
    `${baseUrl}/v2.1/accounts/${encodeURIComponent(
      req.accountId,
    )}/envelopes/${encodeURIComponent(req.envelopeId)}/views/recipient`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        authenticationMethod: "none",
        clientUserId: req.signer.clientUserId,
        email: req.signer.email,
        userName: req.signer.name,
        returnUrl: req.returnUrl,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(
      `DocuSign recipient view failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as DocuSignRecipientViewResponse;
}

export interface DocuSignWebhookEvent {
  event: string;
  data?: {
    envelopeId?: string;
    envelopeSummary?: {
      status?: string;
      completedDateTime?: string;
      envelopeId?: string;
    };
  };
}
