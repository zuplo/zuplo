import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { contractRepository, vendorRepository } from "../repositories/contracts.ts";
import { createDocusignEnvelope } from "../integrations/docusign.ts";
import { postSlackMessage } from "../integrations/slack.ts";

/**
 * Orchestrator: send_contract_for_signature.
 *
 * Reads a draft contract, creates a DocuSign envelope from its `documentUrl`
 * (or inline base64), invites the vendor's contact email + one or more
 * internal signers, and posts a Slack notice to procurement.
 *
 * The envelope id is recorded back on the contract via documentUrl
 * suffix `?envelope=<id>` for cross-reference. We do not poll DocuSign for
 * status — Zuplo's edge runtime is stateless. Instead, configure a DocuSign
 * Connect webhook back to /webhooks/docusign in a follow-up to flip the
 * contract status to `active` when the envelope is signed.
 */

interface Body {
  contractId: string;
  /** Internal signer(s) — usually the contract owner + legal. */
  internalSigners: Array<{ email: string; name: string }>;
  /** Optional: include the vendor's contactEmail as a signer. Default true. */
  includeVendorSigner?: boolean;
  /** Optional inline document. When omitted, we fetch contract.documentUrl. */
  documentBase64?: string;
  documentName?: string;
  emailSubject?: string;
  emailBlurb?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.contractId || !Array.isArray(body.internalSigners) || body.internalSigners.length === 0) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "contractId and internalSigners are required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const contract = await contractRepository.get(tenantId, body.contractId);
  if (!contract) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Contract not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  if (!body.documentBase64 && !contract.documentUrl) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "Provide documentBase64 or set documentUrl on the contract first",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // Resolve vendor for signer + Slack message.
  const vendor = await vendorRepository.get(tenantId, contract.vendorId);
  const signers: Array<{ email: string; name: string }> = [...body.internalSigners];
  if (body.includeVendorSigner !== false && vendor) {
    signers.push({ email: vendor.contactEmail, name: vendor.name });
  }

  const envelope = await createDocusignEnvelope({
    contractId: contract.id,
    documentName: body.documentName ?? contract.title,
    documentUrl: contract.documentUrl ?? undefined,
    documentBase64: body.documentBase64,
    signers,
    emailSubject: body.emailSubject,
    emailBlurb: body.emailBlurb,
  });

  // Stamp the envelope id back onto the contract for cross-reference.
  const newDocUrl = contract.documentUrl
    ? `${contract.documentUrl}#envelope=${envelope.envelopeId}`
    : `docusign://envelope/${envelope.envelopeId}`;
  await contractRepository.update(tenantId, contract.id, {
    documentUrl: newDocUrl,
    status: "draft",
  });

  // Slack: notify procurement that signature is now in flight.
  try {
    await postSlackMessage({
      text: [
        `*Contract sent for signature:* ${contract.title}`,
        vendor ? `Vendor: ${vendor.name}` : `Vendor id: ${contract.vendorId}`,
        `DocuSign envelope: ${envelope.envelopeId}`,
        `Signers: ${signers.map((s) => s.email).join(", ")}`,
      ].join("\n"),
    });
  } catch (err) {
    context.log.warn(
      `Slack notify failed for envelope ${envelope.envelopeId}: ${(err as Error).message}`,
    );
  }

  return new Response(
    JSON.stringify({
      contractId: contract.id,
      envelopeId: envelope.envelopeId,
      status: envelope.status,
      signers,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
