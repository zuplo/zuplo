import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Appointment } from "../repositories/appointments.ts";
import type { Consent } from "../repositories/consents.ts";
import type { Patient } from "../repositories/patients.ts";

/**
 * Orchestrator MCP tool: flag_missing_consents.
 *
 * For each upcoming appointment, check whether the patient has the
 * required consent types signed and not withdrawn. Required consents
 * vary by appointment kind (telehealth visits add the telehealth
 * consent on top of treatment + HIPAA).
 */

interface Body {
  /** How many days of upcoming appointments to consider. Defaults to 14. */
  windowDays?: number;
  /** Override required consents for any appointment kind. */
  requiredByKind?: Partial<Record<Appointment["kind"], Consent["kind"][]>>;
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

const DEFAULT_REQUIRED: Record<Appointment["kind"], Consent["kind"][]> = {
  new: ["treatment", "hipaa"],
  followup: ["treatment", "hipaa"],
  telehealth: ["treatment", "hipaa", "telehealth"],
  procedure: ["treatment", "hipaa"],
};

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const windowDays = Math.max(0, Math.min(60, body.windowDays ?? 14));
  const requiredByKind = {
    ...DEFAULT_REQUIRED,
    ...(body.requiredByKind ?? {}),
  };
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const now = Date.now();
  const cutoff = now + windowDays * 24 * 60 * 60 * 1000;

  const [appointments, consents, patients] = await Promise.all([
    drain<Appointment>(context, "/appointments", auth),
    drain<Consent>(context, "/consents", auth),
    drain<Patient>(context, "/patients", auth),
  ]);

  const patientById = new Map(patients.map((p) => [p.id, p]));

  // Group active (signed and not withdrawn) consents by patient.
  const activeKindsByPatient = new Map<string, Set<Consent["kind"]>>();
  for (const c of consents) {
    if (c.withdrawnAt) continue;
    const set = activeKindsByPatient.get(c.patientId) ?? new Set();
    set.add(c.kind);
    activeKindsByPatient.set(c.patientId, set);
  }

  const upcoming = appointments.filter((a) => {
    const t = new Date(a.scheduledFor).getTime();
    return t >= now && t <= cutoff && a.status === "scheduled";
  });

  const flagged: Array<{
    appointment: Appointment;
    patient: Patient | null;
    requiredConsents: Consent["kind"][];
    missingConsents: Consent["kind"][];
    ready: boolean;
  }> = [];

  for (const appt of upcoming) {
    const required = requiredByKind[appt.kind] ?? [];
    const active = activeKindsByPatient.get(appt.patientId) ?? new Set();
    const missing = required.filter((k) => !active.has(k));

    flagged.push({
      appointment: appt,
      patient: patientById.get(appt.patientId) ?? null,
      requiredConsents: required,
      missingConsents: missing,
      ready: missing.length === 0,
    });
  }

  const blocking = flagged.filter((f) => !f.ready);

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
