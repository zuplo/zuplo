import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { quoteRepository } from "../repositories/quotes.ts";
import { sendResendEmail } from "../integrations/resend.ts";
import {
  createDocusignEnvelope,
  type DocusignDocument,
} from "../integrations/docusign.ts";

interface Body {
  /** Recipient email — the customer signing the quote. */
  recipientEmail: string;
  /** Recipient display name. */
  recipientName: string;
  /** Optional cover note inserted into the email body. */
  coverNote?: string;
  /**
   * Optional base64-encoded PDF of the quote. If provided AND
   * DOCUSIGN_* env is configured, an envelope is created and routed for
   * signature. If omitted, the kit just sends a plain Resend email with
   * a link to the hosted quote.
   */
  pdfBase64?: string;
  /** Hosted URL to the quote in your portal. */
  hostedQuoteUrl?: string;
}

/**
 * Mark a quote as sent and dispatch it.
 *
 * Two delivery modes:
 *   - "esign":   pdfBase64 + DOCUSIGN_* env → DocuSign envelope created
 *   - "email":   otherwise → Resend email with hostedQuoteUrl + coverNote
 *
 * Always flips the quote to status=sent and stamps sentAt.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json().catch(() => ({}))) as Partial<Body>;

  if (!body.recipientEmail || !body.recipientName) {
    return new Response(
      JSON.stringify({
        error: {
          type: "invalid_body",
          message: "recipientEmail and recipientName are required",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  let envelopeId: string | undefined;
  let resendId: string | undefined;
  let mode: "esign" | "email" = "email";

  try {
    if (body.pdfBase64 && process.env.DOCUSIGN_ACCESS_TOKEN) {
      mode = "esign";
      const doc: DocusignDocument = {
        documentBase64: body.pdfBase64,
        name: `Quote-${id}.pdf`,
        fileExtension: "pdf",
        documentId: "1",
      };
      const envelope = await createDocusignEnvelope({
        emailSubject: `Please countersign quote ${id}`,
        emailBlurb: body.coverNote,
        documents: [doc],
        signers: [{ email: body.recipientEmail, name: body.recipientName }],
        quoteId: id,
        status: "sent",
      });
      envelopeId = envelope.envelopeId;
    } else {
      mode = "email";
      const html = `
        <p>Hi ${body.recipientName},</p>
        ${body.coverNote ? `<p>${body.coverNote}</p>` : ""}
        <p>Your quote is ready: ${
          body.hostedQuoteUrl
            ? `<a href="${body.hostedQuoteUrl}">view quote</a>`
            : `Quote id: ${id}`
        }.</p>
      `;
      const sent = await sendResendEmail({
        to: body.recipientEmail,
        subject: `Your quote (${id})`,
        html,
        text: `Your quote ${id} is ready. ${body.hostedQuoteUrl ?? ""}`,
      });
      resendId = sent.id;
    }

    const updated = await quoteRepository.update(tenantId, id, {
      status: "sent",
      sentAt: new Date().toISOString(),
    });
    return new Response(
      JSON.stringify({ ...updated, deliveryMode: mode, envelopeId, resendId }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: err.message } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }
}
