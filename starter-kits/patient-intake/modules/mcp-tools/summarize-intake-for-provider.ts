import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { IntakeSubmission } from "../repositories/intake-submissions.ts";
import type { IntakeForm } from "../repositories/intake-forms.ts";
import type { Patient } from "../repositories/patients.ts";

/**
 * Orchestrator MCP tool: summarize_intake_for_provider.
 *
 * Takes a single IntakeSubmission, joins it with the patient and the
 * form template (so field labels are human-readable), and produces a
 * provider-facing summary. The LLM can use the structured `qa` array
 * verbatim or rewrite into a SOAP-style note.
 */

interface Body {
  submissionId: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.submissionId) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "submissionId is required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const submission = await invokeJson<IntakeSubmission>(
    context,
    `/intake-submissions/${encodeURIComponent(body.submissionId)}`,
    { headers: auth },
  ).catch(() => null);
  if (!submission || !submission.id) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "IntakeSubmission not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const [patient, form] = await Promise.all([
    invokeJson<Patient>(
      context,
      `/patients/${encodeURIComponent(submission.patientId)}`,
      { headers: auth },
    ).catch(() => null),
    invokeJson<IntakeForm>(
      context,
      `/intake-forms/${encodeURIComponent(submission.formId)}`,
      { headers: auth },
    ).catch(() => null),
  ]);

  const fieldsById = new Map((form?.fields ?? []).map((f) => [f.id, f]));

  const qa: Array<{
    fieldId: string;
    label: string;
    kind: string;
    answer: unknown;
    flagged: boolean;
  }> = [];

  for (const [fieldId, value] of Object.entries(submission.payload ?? {})) {
    const field = fieldsById.get(fieldId);
    const label = field?.label ?? fieldId;
    const kind = field?.kind ?? "text";

    // Soft "flagged" hint: empty answers on required fields, or boolean
    // answers commonly indicating a clinical concern (e.g. allergy = yes).
    const isEmpty = value === null || value === undefined || value === "";
    const flagged =
      (field?.required && isEmpty) ||
      (kind === "boolean" && value === true);

    qa.push({ fieldId, label, kind, answer: value, flagged });
  }

  const flaggedCount = qa.filter((q) => q.flagged).length;
  const readyForVisit =
    flaggedCount === 0 && submission.status !== "flagged";

  const headline =
    patient
      ? `Intake summary for ${patient.firstName} ${patient.lastName} (MRN ${patient.mrn}) — ${form?.name ?? "intake form"}.`
      : `Intake summary for submission ${submission.id} — ${form?.name ?? "intake form"}.`;

  return new Response(
    JSON.stringify({
      headline,
      submission,
      patient,
      form,
      qa,
      flaggedCount,
      readyForVisit,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
