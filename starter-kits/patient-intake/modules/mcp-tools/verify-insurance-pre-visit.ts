import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Appointment } from "../repositories/appointments.ts";
import type { Insurance } from "../repositories/insurance.ts";
import type { Patient } from "../repositories/patients.ts";

/**
 * Orchestrator MCP tool: verify_insurance_pre_visit.
 *
 * For every upcoming appointment in the configured window, joins the
 * patient's insurance records and surfaces eligibility gaps the front
 * desk needs to chase before the visit. Output is structured so the
 * LLM can compose tasks ("call BCBS for member 123") or messages.
 */

interface Body {
  /** How many days of upcoming appointments to consider. Defaults to 7. */
  windowDays?: number;
  /** Only consider appointments still in `scheduled` state. Defaults to true. */
  scheduledOnly?: boolean;
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

  const flagged = upcoming.map((appt) => {
    const patient = patientById.get(appt.patientId) ?? null;
    const insurances = insuranceByPatient.get(appt.patientId) ?? [];

    const issues: string[] = [];
    if (insurances.length === 0) {
      issues.push("no_insurance_on_file");
    } else {
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
      readyForVisit: issues.length === 0,
      issues,
    };
  });

  const blocking = flagged.filter((f) => !f.readyForVisit);

  return new Response(
    JSON.stringify({
      windowDays,
      checkedAt: new Date().toISOString(),
      totalUpcoming: upcoming.length,
      blockingCount: blocking.length,
      flagged,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
