import { environment } from "@zuplo/runtime";

/**
 * DocuSign integration for pledge agreements.
 *
 * Used to formalize multi-year pledges with a counter-signed pledge
 * agreement. Same JWT/access-token model as the procurement-po kit; pass a
 * pre-fetched DOCUSIGN_ACCESS_TOKEN.
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
  if (!base) throw new Error("DOCUSIGN_BASE_URI is not set");
  return base.replace(/\/+$/, "");
}

function requireAccountId(): string {
  const id = environment.DOCUSIGN_ACCOUNT_ID;
  if (!id) throw new Error("DOCUSIGN_ACCOUNT_ID is not set");
  return id;
}

export interface PledgeEnvelopeRequest {
  donorEmail: string;
  donorName: string;
  amountCents: number;
  currency: string;
  termYears: number;
  metadata: Record<string, string>;
}

export interface CreateEnvelopeResponse {
  envelopeId: string;
  status: string;
  uri: string;
}

/**
 * Send a pledge agreement to a donor for signature. Uses an inline base64
 * placeholder document — pass `documentBase64` to override with your real
 * pledge template.
 */
export async function sendPledgeEnvelope(
  args: PledgeEnvelopeRequest & { documentBase64?: string; documentName?: string },
): Promise<CreateEnvelopeResponse> {
  const token = requireToken();
  const account = requireAccountId();
  const base = requireBaseUri();

  const total = (args.amountCents / 100).toFixed(2);
  // btoa requires Latin-1; use ASCII-only punctuation in the placeholder to avoid InvalidCharacterError.
  const placeholder = btoa(
    `Pledge Agreement\n\nDonor: ${args.donorName} <${args.donorEmail}>\nAmount: ${args.currency} ${total}\nTerm: ${args.termYears} year(s)\n\nThe donor agrees to fulfill this pledge in equal installments over the term above. This is a placeholder - pass documentBase64 in the request to attach a real document.`,
  );

  const body = {
    emailSubject: `Pledge Agreement: ${args.currency} ${total} over ${args.termYears} year${args.termYears === 1 ? "" : "s"}`,
    emailBlurb: `Hi ${args.donorName}, please review and sign your pledge agreement.`,
    documents: [
      {
        documentId: "1",
        name: args.documentName ?? "Pledge-Agreement.pdf",
        fileExtension: "pdf",
        documentBase64: args.documentBase64 ?? placeholder,
      },
    ],
    recipients: {
      signers: [
        {
          email: args.donorEmail,
          name: args.donorName,
          recipientId: "1",
          routingOrder: "1",
          tabs: {
            signHereTabs: [
              {
                documentId: "1",
                pageNumber: "1",
                xPosition: "100",
                yPosition: "200",
              },
            ],
          },
        },
      ],
    },
    customFields: {
      textCustomFields: Object.entries(args.metadata).map(([name, value]) => ({
        name,
        value,
        required: "false",
        show: "false",
      })),
    },
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
