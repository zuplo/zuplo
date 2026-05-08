import { environment, type ZuploContext, type ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { intakeSubmissionRepository } from "../repositories/intake-submissions.ts";
import { patientRepository } from "../repositories/patients.ts";
import { checkTwilioVerification } from "../integrations/twilio.ts";

interface Body {
  patientId: string;
  formId: string;
  payload: Record<string, unknown>;
  /** OTP the patient just received via SMS (Twilio Verify). */
  verificationCode?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  // Gate intake submission on a successful Twilio Verify check unless
  // TWILIO_VERIFY_SERVICE_SID is unset (dev / in-memory mode).
  if (environment.TWILIO_VERIFY_SERVICE_SID) {
    if (!body.verificationCode) {
      return new Response(
        JSON.stringify({
          error: {
            type: "verification_required",
            message:
              "verificationCode is required. Call /intake/start-verification first.",
          },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
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
    const result = await checkTwilioVerification({
      to: patient.phone,
      code: body.verificationCode,
    });
    if (result.status !== "approved" || !result.valid) {
      return new Response(
        JSON.stringify({
          error: {
            type: "verification_failed",
            message: "Twilio Verify rejected the code.",
            status: result.status,
          },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }
  }

  const created = await intakeSubmissionRepository.create(tenantId, {
    patientId: body.patientId,
    formId: body.formId,
    payload: body.payload,
    status: "received",
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
