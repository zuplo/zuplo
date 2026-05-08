import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { patientRepository } from "../repositories/patients.ts";
import { startTwilioVerification } from "../integrations/twilio.ts";

/**
 * POST /intake/start-verification — sends a Twilio Verify SMS code to
 * the patient. The patient types it back into the intake form, which
 * passes it to /intake/{id}/submit. Submission is gated on a successful
 * /VerificationCheck.
 */

interface Body {
  patientId: string;
  channel?: "sms" | "call" | "email";
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const patient = await patientRepository.get(tenantId, body.patientId);
  if (!patient) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Patient not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const target = body.channel === "email" ? patient.email : patient.phone;
  const verification = await startTwilioVerification({
    to: target,
    channel: body.channel ?? "sms",
  });

  return new Response(
    JSON.stringify({
      sid: verification.sid,
      status: verification.status,
      channel: verification.channel,
      to: verification.to,
    }),
    { status: 202, headers: { "content-type": "application/json" } },
  );
}
