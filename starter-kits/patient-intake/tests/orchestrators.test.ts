import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import flagMissingConsents from "../modules/mcp-tools/flag-missing-consents.ts";
import verifyInsurancePreVisit from "../modules/mcp-tools/verify-insurance-pre-visit.ts";
import summarizeIntakeForProvider from "../modules/mcp-tools/summarize-intake-for-provider.ts";
import listAppointments from "../modules/handlers/list-appointments.ts";
import listConsents from "../modules/handlers/list-consents.ts";
import listPatients from "../modules/handlers/list-patients.ts";
import listInsurance from "../modules/handlers/list-insurance.ts";
import getIntakeSubmission from "../modules/handlers/get-intake-submission.ts";
import getPatient from "../modules/handlers/get-patient.ts";
import { appointmentRepository } from "../modules/repositories/appointments.ts";
import { consentRepository } from "../modules/repositories/consents.ts";
import { patientRepository } from "../modules/repositories/patients.ts";
import { insuranceRepository } from "../modules/repositories/insurance.ts";
import { intakeSubmissionRepository } from "../modules/repositories/intake-submissions.ts";
import { intakeFormRepository } from "../modules/repositories/intake-forms.ts";

async function getIntakeForm(
  request: import("@zuplo/runtime").ZuploRequest,
): Promise<Response> {
  const r = request as unknown as {
    user?: { data?: { tenantId?: string } };
    params?: { id?: string };
  };
  const tenantId = r.user?.data?.tenantId;
  const id = r.params?.id;
  if (!tenantId || !id) return new Response("unauth", { status: 401 });
  const form = await intakeFormRepository.get(tenantId, id);
  if (!form) return new Response("not found", { status: 404 });
  return new Response(JSON.stringify(form), {
    headers: { "content-type": "application/json" },
  });
}

const routes = {
  "GET /appointments": listAppointments,
  "GET /consents": listConsents,
  "GET /patients": listPatients,
  "GET /patients/:id": getPatient,
  "GET /insurance": listInsurance,
  "GET /intake-submissions/:id": getIntakeSubmission,
  "GET /intake-forms/:id": getIntakeForm,
};

const SOON = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
const FAR = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

const env = environment as Record<string, string | undefined>;

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete env[name];
    delete process.env[name];
  } else {
    env[name] = value;
    process.env[name] = value;
  }
}

async function clearAll() {
  for (const repo of [
    appointmentRepository,
    consentRepository,
    patientRepository,
    insuranceRepository,
    intakeSubmissionRepository,
    intakeFormRepository,
  ]) {
    for (const tenantId of ["tenant-a", "tenant-b"]) {
      const page = await repo.list(tenantId, { limit: 200 });
      for (const item of page.items) {
        await repo.delete(tenantId, item.id);
      }
    }
  }
}

beforeEach(clearAll);
afterEach(async () => {
  vi.restoreAllMocks();
  await clearAll();
  setEnv("STEDI_API_KEY", undefined);
});

describe("orchestrators/flag_missing_consents", () => {
  it("flags appointments missing required consent kinds", async () => {
    const patient = await patientRepository.create("tenant-a", {
      firstName: "Ada",
      lastName: "Lovelace",
      dateOfBirth: "1990-01-01",
      email: "ada@example.com",
      phone: "+1",
      mrn: "MRN1",
      address: "1",
      primaryProviderEmail: null,
      status: "active",
      createdAt: new Date().toISOString(),
    });
    await appointmentRepository.create("tenant-a", {
      patientId: patient.id,
      providerEmail: "doc@x.com",
      scheduledFor: SOON,
      durationMinutes: 30,
      kind: "telehealth", // requires telehealth + treatment + hipaa
      status: "scheduled",
      createdAt: new Date().toISOString(),
    });
    // Only treatment is signed, hipaa + telehealth missing.
    await consentRepository.create("tenant-a", {
      patientId: patient.id,
      kind: "treatment",
      version: "1.0",
      signedAt: new Date().toISOString(),
      withdrawnAt: null,
    });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/flag_missing_consents",
      method: "POST",
      body: { windowDays: 7 },
      tenantId: "tenant-a",
    });
    const res = await flagMissingConsents(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      blockingCount: number;
      flagged: { ready: boolean; missingConsents: string[] }[];
    };
    expect(data.blockingCount).toBe(1);
    expect(data.flagged[0].ready).toBe(false);
    expect(data.flagged[0].missingConsents.sort()).toEqual([
      "hipaa",
      "telehealth",
    ]);
  });

  it("returns no-op when there are no upcoming appointments", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/flag_missing_consents",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await flagMissingConsents(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { blockingCount: number; totalUpcoming: number };
    expect(data.totalUpcoming).toBe(0);
    expect(data.blockingCount).toBe(0);
  });

  it("ignores withdrawn consents", async () => {
    const patient = await patientRepository.create("tenant-a", {
      firstName: "B",
      lastName: "C",
      dateOfBirth: "1980-01-01",
      email: "b@c.com",
      phone: "+1",
      mrn: "M2",
      address: "x",
      primaryProviderEmail: null,
      status: "active",
      createdAt: new Date().toISOString(),
    });
    await appointmentRepository.create("tenant-a", {
      patientId: patient.id,
      providerEmail: "doc@x.com",
      scheduledFor: SOON,
      durationMinutes: 30,
      kind: "new", // requires treatment + hipaa
      status: "scheduled",
      createdAt: new Date().toISOString(),
    });
    // Both consents signed but treatment was withdrawn.
    await consentRepository.create("tenant-a", {
      patientId: patient.id,
      kind: "treatment",
      version: "1.0",
      signedAt: new Date().toISOString(),
      withdrawnAt: new Date().toISOString(),
    });
    await consentRepository.create("tenant-a", {
      patientId: patient.id,
      kind: "hipaa",
      version: "1.0",
      signedAt: new Date().toISOString(),
      withdrawnAt: null,
    });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/flag_missing_consents",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await flagMissingConsents(request, context);
    const data = (await res.json()) as { flagged: { missingConsents: string[] }[] };
    expect(data.flagged[0].missingConsents).toEqual(["treatment"]);
  });

  it("isolates tenants — tenant-a's appointments don't leak to tenant-b", async () => {
    const patientA = await patientRepository.create("tenant-a", {
      firstName: "A",
      lastName: "A",
      dateOfBirth: "1990-01-01",
      email: "a@a.com",
      phone: "+1",
      mrn: "MA",
      address: "x",
      primaryProviderEmail: null,
      status: "active",
      createdAt: new Date().toISOString(),
    });
    await appointmentRepository.create("tenant-a", {
      patientId: patientA.id,
      providerEmail: "doc@x.com",
      scheduledFor: SOON,
      durationMinutes: 30,
      kind: "new",
      status: "scheduled",
      createdAt: new Date().toISOString(),
    });

    const { context } = makeContext({ routes, tenantId: "tenant-b" });
    const request = makeRequest({
      url: "https://kit.test/mcp/flag_missing_consents",
      method: "POST",
      body: {},
      tenantId: "tenant-b",
    });
    const res = await flagMissingConsents(request, context);
    const data = (await res.json()) as { totalUpcoming: number };
    expect(data.totalUpcoming).toBe(0);
  });
});

describe("orchestrators/verify_insurance_pre_visit", () => {
  it("calls Stedi for each insurance plan on each upcoming appointment", async () => {
    setEnv("STEDI_API_KEY", "stedi_test");
    const patient = await patientRepository.create("tenant-a", {
      firstName: "Ada",
      lastName: "Lovelace",
      dateOfBirth: "1990-01-01",
      email: "a@b.com",
      phone: "+1",
      mrn: "M1",
      address: "x",
      primaryProviderEmail: null,
      status: "active",
      createdAt: new Date().toISOString(),
    });
    await appointmentRepository.create("tenant-a", {
      patientId: patient.id,
      providerEmail: "doc@x.com",
      scheduledFor: SOON,
      durationMinutes: 30,
      kind: "new",
      status: "scheduled",
      createdAt: new Date().toISOString(),
    });
    await insuranceRepository.create("tenant-a", {
      patientId: patient.id,
      payerName: "BCBSF",
      planName: "Gold",
      memberId: "MEM1",
      groupNumber: "GRP",
      verified: false,
      verifiedAt: null,
      eligibility: "unknown",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          meta: { traceId: "t1" },
          benefitsInformation: [{ code: "1", name: "Active" }],
        }),
        { status: 200 },
      ),
    );

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/verify_insurance_pre_visit",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await verifyInsurancePreVisit(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      payerCheckEnabled: boolean;
      blockingCount: number;
      flagged: { liveChecks: { active: boolean | null }[] }[];
    };
    expect(data.payerCheckEnabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(data.flagged[0].liveChecks).toHaveLength(1);
    expect(data.flagged[0].liveChecks[0].active).toBe(true);
    expect(data.blockingCount).toBe(0);
  });

  it("flags 'no_insurance_on_file' when patient has no insurance row", async () => {
    setEnv("STEDI_API_KEY", "stedi_test");
    const patient = await patientRepository.create("tenant-a", {
      firstName: "X",
      lastName: "Y",
      dateOfBirth: "1990-01-01",
      email: "x@y.com",
      phone: "+1",
      mrn: "M",
      address: "x",
      primaryProviderEmail: null,
      status: "active",
      createdAt: new Date().toISOString(),
    });
    await appointmentRepository.create("tenant-a", {
      patientId: patient.id,
      providerEmail: "doc@x.com",
      scheduledFor: SOON,
      durationMinutes: 30,
      kind: "new",
      status: "scheduled",
      createdAt: new Date().toISOString(),
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/verify_insurance_pre_visit",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await verifyInsurancePreVisit(request, context);
    const data = (await res.json()) as {
      blockingCount: number;
      flagged: { issues: string[] }[];
    };
    expect(data.blockingCount).toBe(1);
    expect(data.flagged[0].issues).toContain("no_insurance_on_file");
    // No fetch should happen because insurances.length === 0 short-circuits.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips Stedi when skipPayerCheck is true (drafts only)", async () => {
    setEnv("STEDI_API_KEY", "stedi_test");
    const patient = await patientRepository.create("tenant-a", {
      firstName: "A",
      lastName: "B",
      dateOfBirth: "1990-01-01",
      email: "a@b.com",
      phone: "+1",
      mrn: "M",
      address: "x",
      primaryProviderEmail: null,
      status: "active",
      createdAt: new Date().toISOString(),
    });
    await appointmentRepository.create("tenant-a", {
      patientId: patient.id,
      providerEmail: "doc@x.com",
      scheduledFor: SOON,
      durationMinutes: 30,
      kind: "new",
      status: "scheduled",
      createdAt: new Date().toISOString(),
    });
    await insuranceRepository.create("tenant-a", {
      patientId: patient.id,
      payerName: "BCBSF",
      planName: "G",
      memberId: "M",
      groupNumber: "G",
      verified: true,
      verifiedAt: new Date().toISOString(),
      eligibility: "active",
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/verify_insurance_pre_visit",
      method: "POST",
      body: { skipPayerCheck: true },
      tenantId: "tenant-a",
    });
    const res = await verifyInsurancePreVisit(request, context);
    const data = (await res.json()) as { payerCheckEnabled: boolean; blockingCount: number };
    expect(data.payerCheckEnabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    // Stored eligibility is active+verified, so nothing blocks.
    expect(data.blockingCount).toBe(0);
  });

  it("auto-skips payer check when STEDI_API_KEY is unset", async () => {
    setEnv("STEDI_API_KEY", undefined);
    const patient = await patientRepository.create("tenant-a", {
      firstName: "A",
      lastName: "B",
      dateOfBirth: "1990-01-01",
      email: "a@b.com",
      phone: "+1",
      mrn: "M",
      address: "x",
      primaryProviderEmail: null,
      status: "active",
      createdAt: new Date().toISOString(),
    });
    await appointmentRepository.create("tenant-a", {
      patientId: patient.id,
      providerEmail: "doc@x.com",
      scheduledFor: SOON,
      durationMinutes: 30,
      kind: "new",
      status: "scheduled",
      createdAt: new Date().toISOString(),
    });
    await insuranceRepository.create("tenant-a", {
      patientId: patient.id,
      payerName: "X",
      planName: "Y",
      memberId: "Z",
      groupNumber: "G",
      verified: false,
      verifiedAt: null,
      eligibility: "unknown",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/verify_insurance_pre_visit",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await verifyInsurancePreVisit(request, context);
    const data = (await res.json()) as { payerCheckEnabled: boolean };
    expect(data.payerCheckEnabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("isolates tenants — tenant-a appointments invisible to tenant-b", async () => {
    setEnv("STEDI_API_KEY", "stedi_test");
    const patientA = await patientRepository.create("tenant-a", {
      firstName: "A",
      lastName: "A",
      dateOfBirth: "1990-01-01",
      email: "a@a.com",
      phone: "+1",
      mrn: "M",
      address: "x",
      primaryProviderEmail: null,
      status: "active",
      createdAt: new Date().toISOString(),
    });
    await appointmentRepository.create("tenant-a", {
      patientId: patientA.id,
      providerEmail: "doc@x.com",
      scheduledFor: SOON,
      durationMinutes: 30,
      kind: "new",
      status: "scheduled",
      createdAt: new Date().toISOString(),
    });
    await insuranceRepository.create("tenant-a", {
      patientId: patientA.id,
      payerName: "X",
      planName: "Y",
      memberId: "Z",
      groupNumber: "G",
      verified: true,
      verifiedAt: new Date().toISOString(),
      eligibility: "active",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId: "tenant-b" });
    const request = makeRequest({
      url: "https://kit.test/mcp/verify_insurance_pre_visit",
      method: "POST",
      body: {},
      tenantId: "tenant-b",
    });
    const res = await verifyInsurancePreVisit(request, context);
    const data = (await res.json()) as { totalUpcoming: number };
    expect(data.totalUpcoming).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("orchestrators/summarize_intake_for_provider", () => {
  it("joins patient + form + submission and emits a structured Q&A array", async () => {
    const patient = await patientRepository.create("tenant-a", {
      firstName: "Ada",
      lastName: "Lovelace",
      dateOfBirth: "1990-01-01",
      email: "ada@example.com",
      phone: "+1",
      mrn: "MRN42",
      address: "1 Main",
      primaryProviderEmail: null,
      status: "active",
      createdAt: new Date().toISOString(),
    });
    const form = await intakeFormRepository.create("tenant-a", {
      slug: "history",
      name: "History form",
      fields: [
        { id: "allergies", label: "Allergies?", kind: "boolean", required: false },
        { id: "name", label: "Name", kind: "text", required: true },
      ],
      targetVisitKind: "new",
      active: true,
      createdAt: new Date().toISOString(),
    });
    const submission = await intakeSubmissionRepository.create("tenant-a", {
      patientId: patient.id,
      formId: form.id,
      payload: { allergies: true, name: "Ada" },
      status: "received",
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
    });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/summarize_intake_for_provider",
      method: "POST",
      body: { submissionId: submission.id },
      tenantId: "tenant-a",
    });
    const res = await summarizeIntakeForProvider(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      headline: string;
      flaggedCount: number;
      qa: { fieldId: string; label: string; flagged: boolean }[];
    };
    expect(data.headline).toContain("Ada Lovelace");
    expect(data.headline).toContain("MRN42");
    const allergiesQa = data.qa.find((q) => q.fieldId === "allergies");
    expect(allergiesQa?.label).toBe("Allergies?");
    expect(allergiesQa?.flagged).toBe(true); // boolean=true is flagged
    expect(data.flaggedCount).toBeGreaterThan(0);
  });

  it("returns 400 when submissionId is missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/summarize_intake_for_provider",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await summarizeIntakeForProvider(request, context);
    expect(res.status).toBe(400);
  });

  it("returns 404 when submission does not exist", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/summarize_intake_for_provider",
      method: "POST",
      body: { submissionId: "missing" },
      tenantId: "tenant-a",
    });
    const res = await summarizeIntakeForProvider(request, context);
    expect(res.status).toBe(404);
  });
});
