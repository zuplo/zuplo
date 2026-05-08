import { environment, type ZuploContext, type ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Appointment } from "../repositories/appointments.ts";
import type { Insurance } from "../repositories/insurance.ts";
import type { Patient } from "../repositories/patients.ts";
import { checkStediEligibility } from "../integrations/stedi.ts";

/**
 * Orchestrator MCP tool: verify_insurance_pre_visit.
 *
 * For every upcoming appointment in the configured window, joins the
 * patient's insurance records and runs a real-time eligibility check
 * against Stedi (X12 270/271) for each plan we have on file. Surfaces
 * eligibility gaps the front desk needs to chase before the visit.
 *
 * Output is structured so the LLM can compose tasks ("call BCBS for
 * member 123") or send messages.
 */

interface Body {
  /** How many days of upcoming appointments to consider. Defaults to 7. */
  windowDays?: number;
  /** Only consider appointments still in `scheduled` state. Defaults to true. */
  scheduledOnly?: boolean;
  /** Skip the live Stedi call (use stored eligibility flags only). */
  skipPayerCheck?: boolean;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

async function drain<T>(
  context: ZuploContext,
  path: string,
  auth: { authorization: string },
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const sep = path.includes("?") ? "&" : "?";
    const page = await invokeJson<Page<T>>(context, `${path}${sep}${qs}`, {
      headers: auth,
    });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 10000) break;
  } while (cursor);
  return all;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const windowDays = Math.max(0, Math.min(60, body.windowDays ?? 7));
  const scheduledOnly = body.scheduledOnly ?? true;
  const skipPayerCheck = body.skipPayerCheck ?? !environment.STEDI_API_KEY;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const now = Date.now();
  const cutoff = now + windowDays * 24 * 60 * 60 * 1000;

  const [appointments, patients, insurance] = await Promise.all([
    drain<Appointment>(context, "/appointments", auth),
    drain<Patient>(context, "/patients", auth),
    drain<Insurance>(context, "/insurance", auth),
  ]);

  const patientById = new Map(patients.map((p) => [p.id, p]));

  // Group insurance by patient.
  const insuranceByPatient = new Map<string, Insurance[]>();
  for (const ins of insurance) {
    const list = insuranceByPatient.get(ins.patientId) ?? [];
    list.push(ins);
    insuranceByPatient.set(ins.patientId, list);
  }

  const upcoming = appointments.filter((a) => {
    const t = new Date(a.scheduledFor).getTime();
    if (t < now || t > cutoff) return false;
    if (scheduledOnly && a.status !== "scheduled") return false;
    return true;
  });

  const providerNpi = environment.STEDI_PROVIDER_NPI ?? "1234567890";
  const providerOrgName =
    environment.STEDI_PROVIDER_ORG_NAME ?? "Patient Intake Clinic";

  const flagged = await Promise.all(
    upcoming.map(async (appt) => {
      const patient = patientById.get(appt.patientId) ?? null;
      const insurances = insuranceByPatient.get(appt.patientId) ?? [];

      const issues: string[] = [];
      const liveChecks: Array<{
        insuranceId: string;
        active: boolean | null;
        planDescription: string | null;
        traceId: string | null;
        error?: string;
      }> = [];

      if (insurances.length === 0) {
        issues.push("no_insurance_on_file");
      } else if (!patient) {
        issues.push("patient_record_missing");
      } else if (!skipPayerCheck) {
        // Live payer check via Stedi for each plan we have on file.
        for (const ins of insurances) {
          try {
            const summary = await checkStediEligibility({
              tradingPartnerServiceId: ins.payerName,
              provider: {
                organizationName: providerOrgName,
                npi: providerNpi,
              },
              subscriber: {
                memberId: ins.memberId,
                firstName: patient.firstName,
                lastName: patient.lastName,
                dateOfBirth: patient.dateOfBirth,
              },
              encounter: {
                serviceTypeCodes: ["30"],
                dateOfService: appt.scheduledFor.slice(0, 10),
              },
            });
            liveChecks.push({
              insuranceId: ins.id,
              active: summary.active,
              planDescription: summary.planDescription,
              traceId: summary.traceId,
            });
            if (summary.inactive) issues.push("payer_returned_inactive");
          } catch (err) {
            liveChecks.push({
              insuranceId: ins.id,
              active: null,
              planDescription: null,
              traceId: null,
              error: err instanceof Error ? err.message : String(err),
            });
            issues.push("payer_check_failed");
          }
        }
        if (
          liveChecks.length > 0 &&
          !liveChecks.some((c) => c.active === true)
        ) {
          issues.push("no_active_eligibility_from_payer");
        }
      } else {
        // Fallback to stored flags if Stedi key isn't configured.
        const anyVerified = insurances.some((i) => i.verified);
        if (!anyVerified) issues.push("no_verified_insurance");
        const anyActive = insurances.some((i) => i.eligibility === "active");
        if (!anyActive) issues.push("no_active_eligibility");
        const expired = insurances.some((i) => i.eligibility === "expired");
        if (expired) issues.push("has_expired_plan");
        const unknown = insurances.some((i) => i.eligibility === "unknown");
        if (unknown) issues.push("has_unverified_eligibility");
      }

      return {
        appointment: appt,
        patient,
        insurances,
        liveChecks,
        readyForVisit: issues.length === 0,
        issues,
      };
    }),
  );

  const blocking = flagged.filter((f) => !f.readyForVisit);

  return new Response(
    JSON.stringify({
      windowDays,
      checkedAt: new Date().toISOString(),
      payerCheckEnabled: !skipPayerCheck,
      totalUpcoming: upcoming.length,
      blockingCount: blocking.length,
      flagged,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
