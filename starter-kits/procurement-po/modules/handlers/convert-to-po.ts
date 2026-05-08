import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { purchaseRequestRepository } from "../repositories/purchase-requests.ts";
import { purchaseOrderRepository } from "../repositories/purchase-orders.ts";
import { vendorRepository } from "../repositories/vendors.ts";
import { sendEnvelope } from "../integrations/docusign.ts";
import { sendResendEmail, defaultFrom } from "../integrations/resend.ts";

interface Body {
  poNumber?: string;
  /** If true and DocuSign + vendor email are configured, send the PO out for signature. */
  sendForSignature?: boolean;
  /** Provide an inline base64 PDF if you generate the PO on the client; otherwise we render a simple plaintext-PDF placeholder. */
  poPdfBase64?: string;
}

/**
 * Convert an approved purchase request into a PO.
 *
 * If `sendForSignature=true` and DocuSign creds are present, we send the PO
 * to the vendor as a DocuSign envelope. In parallel, we email the vendor a
 * notification via Resend so they're not waiting on the DocuSign email
 * alone. The DocuSign webhook (Connect / EventNotification) flips the PO
 * status as the envelope progresses.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = ((await request.json().catch(() => ({}))) as Body) ?? {};

  const pr = await purchaseRequestRepository.get(tenantId, id);
  if (!pr) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Purchase request not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  if (pr.status !== "approved") {
    return new Response(
      JSON.stringify({
        error: {
          type: "invalid_state",
          message: "Purchase request must be approved before issuing a PO.",
        },
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }

  const vendor = await vendorRepository.get(tenantId, pr.vendorId).catch(() => null);
  const poNumber = body.poNumber ?? `PO-${Date.now()}`;
  const poTotal = (pr.totalCents / 100).toFixed(2);

  // Always create the PO row first; DocuSign + email are best-effort and
  // their status gets stamped onto the same row.
  let po = await purchaseOrderRepository.create(tenantId, {
    purchaseRequestId: pr.id,
    vendorId: pr.vendorId,
    poNumber,
    totalCents: pr.totalCents,
    currency: pr.currency,
    status: "issued",
    issuedAt: new Date().toISOString(),
    docusignEnvelopeId: null,
    docusignStatus: null,
    vendorEmailId: null,
  });

  if (body.sendForSignature && vendor?.email) {
    if (environment.DOCUSIGN_ACCESS_TOKEN) {
      try {
        const pdfBase64 =
          body.poPdfBase64 ??
          btoa(
            `Purchase Order ${poNumber}\n\nVendor: ${vendor.name}\nTotal: ${pr.currency} ${poTotal}\nIssued: ${po.issuedAt}\n\nThis is a placeholder PDF. Pass poPdfBase64 in the request body to attach a real document.`,
          );
        const env = await sendEnvelope({
          emailSubject: `Purchase Order ${poNumber} from ${vendor.name ? "us" : "your customer"}`,
          emailBody: `Please review and sign Purchase Order ${poNumber} (${pr.currency} ${poTotal}).`,
          documentName: `${poNumber}.pdf`,
          documentBase64: pdfBase64,
          fileExtension: "pdf",
          signers: [{ email: vendor.email, name: vendor.name }],
          envelopeMetadata: {
            tenant_id: tenantId,
            tenant_po_id: po.id,
            po_number: poNumber,
          },
        });
        po = await purchaseOrderRepository.update(tenantId, po.id, {
          docusignEnvelopeId: env.envelopeId,
          docusignStatus: env.status,
        });
      } catch (err) {
        context.log.error(
          `convert_to_po docusign send failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (environment.RESEND_API_KEY) {
      try {
        const sent = await sendResendEmail({
          from: defaultFrom(),
          to: vendor.email,
          subject: `Purchase Order ${poNumber} ready for signature`,
          text: `Hi ${vendor.name},\n\nWe've issued PO ${poNumber} for ${pr.currency} ${poTotal}. You'll receive a separate email from DocuSign to sign — please return at your earliest convenience.\n\nThanks!`,
          tags: [
            { name: "kit", value: "procurement-po" },
            { name: "po_number", value: poNumber },
          ],
        });
        po = await purchaseOrderRepository.update(tenantId, po.id, {
          vendorEmailId: sent.id,
        });
      } catch (err) {
        context.log.error(
          `convert_to_po resend send failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  try {
    await purchaseRequestRepository.update(tenantId, pr.id, { status: "converted_to_po" });
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }

  return new Response(JSON.stringify(po), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
