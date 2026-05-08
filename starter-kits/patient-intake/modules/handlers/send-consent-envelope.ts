import { environment, type ZuploContext, type ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { patientRepository } from "../repositories/patients.ts";
import {
  getDocuSignSigningUrl,
  sendDocuSignEnvelope,
} from "../integrations/docusign.ts";

/**
 * POST /consent/send-envelope — sends a DocuSign envelope built from a
 * pre-configured template (HIPAA / treatment / telehealth consent) to
 * the patient and returns either an embedded signing URL (when a
 * clientUserId is supplied) or the DocuSign envelope id.
 */

interface Body {
  patientId: string;
  /** DocuSign template id pre-built in the DocuSign console. */
  templateId: string;
  /**
   * Consent kind we'll record once the envelope is "completed". Used
   * by the DocuSign webhook to materialize a Consent row.
   */
  consentKind: "treatment" | "hipaa" | "telehealth" | "research";
  /** Optional version label persisted with the consent record. */
  version?: string;
  /** When set, returns an embedded signing URL for tablet kiosks. */
  embeddedSigning?: boolean;
  /** Where DocuSign should redirect after embedded signing. */
  returnUrl?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const accountId = environment.DOCUSIGN_ACCOUNT_ID;
  if (!accountId) {
    return new Response(
      JSON.stringify({
        error: {
          type: "configuration_error",
          message: "DOCUSIGN_ACCOUNT_ID is not set",
        },
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const patient = await patientRepository.get(tenantId, body.patientId);
  if (!patient) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Patient not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const clientUserId = body.embeddedSigning ? patient.id : undefined;

  const envelope = await sendDocuSignEnvelope({
    accountId,
    templateId: body.templateId,
    signer: {
      name: `${patient.firstName} ${patient.lastName}`.trim(),
      email: patient.email,
      roleName: "Patient",
      clientUserId,
    },
    prefill: {
      patientId: patient.id,
      consentKind: body.consentKind,
      consentVersion: body.version ?? "1.0",
    },
    emailSubject: `Sign your ${body.consentKind} consent for your visit`,
  });

  let signingUrl: string | null = null;
  if (body.embeddedSigning && clientUserId && body.returnUrl) {
    const view = await getDocuSignSigningUrl({
      accountId,
      envelopeId: envelope.envelopeId,
      signer: {
        name: `${patient.firstName} ${patient.lastName}`.trim(),
        email: patient.email,
        clientUserId,
      },
      returnUrl: body.returnUrl,
    });
    signingUrl = view.url;
  }

  return new Response(
    JSON.stringify({
      envelopeId: envelope.envelopeId,
      status: envelope.status,
      signingUrl,
      patientId: patient.id,
      consentKind: body.consentKind,
      version: body.version ?? "1.0",
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
