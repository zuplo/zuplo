import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import type {
  Client,
  Matter,
  MatterDocument,
} from "../repositories/matters.ts";
import { signatureEnvelopeRepository } from "../repositories/matters.ts";
import { createDocuSignEnvelope } from "../integrations/docusign.ts";

/**
 * Orchestrator MCP tool: send_for_signature.
 *
 * Creates a DocuSign envelope for a matter document and tracks the
 * envelope id against the matter so a signed-event webhook (DocuSign
 * Connect → /webhooks/docusign) can update its status. The caller passes
 * the document content as base64; the kit pulls the matter & client
 * record so the envelope email subject and signer name are coherent.
 */

interface ExtraSigner {
  email: string;
  name: string;
}

interface Body {
  matterId: string;
  /** Optional reference to an existing MatterDocument record. */
  documentId?: string;
  /** Override the email subject; defaults to "<matter.title> — signature requested". */
  emailSubject?: string;
  emailBlurb?: string;
  /** File contents, base64-encoded. */
  documentBase64: string;
  /** File name shown in the DocuSign envelope (e.g. "Engagement Letter.pdf"). */
  documentName: string;
  /** Lowercase extension: pdf | docx | txt | html. */
  fileExtension: string;
  /** Optional anchor text where to drop sign-here tabs. */
  signHerePlaceholder?: string;
  /** Additional signers (besides the client). */
  extraSigners?: ExtraSigner[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.matterId || !body.documentBase64 || !body.documentName) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "matterId, documentBase64, and documentName are required",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const matter = await invokeJson<Matter>(
    context,
    `/matters/${encodeURIComponent(body.matterId)}`,
    { headers: auth },
  );
  const client = await invokeJson<Client>(
    context,
    `/clients/${encodeURIComponent(matter.clientId)}`,
    { headers: auth },
  );

  // If a documentId is supplied, validate it points to this matter.
  if (body.documentId) {
    try {
      const doc = await invokeJson<MatterDocument>(
        context,
        `/documents/${encodeURIComponent(body.documentId)}`,
        { headers: auth },
      );
      if (doc.matterId !== body.matterId) {
        return new Response(
          JSON.stringify({
            error: {
              type: "bad_request",
              message: "documentId does not belong to the specified matter",
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
    } catch {
      // Soft-fail validation — DocuSign call still proceeds with the bytes.
    }
  }

  const subject = body.emailSubject ?? `${matter.title} — signature requested`;
  const signers = [
    { email: client.email, name: client.name },
    ...(body.extraSigners ?? []),
  ].map((s, i) => ({
    email: s.email,
    name: s.name,
    signHerePlaceholder: body.signHerePlaceholder,
    recipientId: String(i + 1),
  }));

  const envelope = await createDocuSignEnvelope({
    emailSubject: subject,
    emailBlurb: body.emailBlurb,
    status: "sent",
    documents: [
      {
        documentBase64: body.documentBase64,
        name: body.documentName,
        fileExtension: body.fileExtension,
      },
    ],
    signers,
    customFields: {
      matterId: body.matterId,
      tenantId,
      ...(body.documentId ? { documentId: body.documentId } : {}),
    },
  });

  // Track the envelope so the inbound DocuSign Connect webhook can update
  // it without us having to ask DocuSign every time.
  const stored = await signatureEnvelopeRepository.create(tenantId, {
    matterId: body.matterId,
    documentId: body.documentId ?? null,
    envelopeId: envelope.envelopeId,
    subject,
    signerEmails: signers.map((s) => s.email),
    status: envelope.status,
    sentAt: envelope.statusDateTime,
    completedAt: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({
      matterId: body.matterId,
      clientName: client.name,
      envelopeId: envelope.envelopeId,
      docusignStatus: envelope.status,
      sentAt: envelope.statusDateTime,
      tracker: stored,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
