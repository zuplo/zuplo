import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import summarizeCandidate from "../modules/mcp-tools/summarize-candidate.ts";
import compareCandidates from "../modules/mcp-tools/compare-candidates.ts";
import pipelineHealthForJob from "../modules/mcp-tools/pipeline-health-for-job.ts";
import scheduleInterview from "../modules/handlers/schedule-interview.ts";
import listApplications from "../modules/handlers/list-applications.ts";
import getApplication from "../modules/handlers/get-application.ts";
import {
  applicationRepository,
  type Application,
} from "../modules/repositories/applications.ts";
import {
  candidateRepository,
  type Candidate,
} from "../modules/repositories/candidates.ts";
import {
  scorecardRepository,
  type Scorecard,
} from "../modules/repositories/scorecards.ts";
import { interviewRepository } from "../modules/repositories/interviews.ts";

const ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "GOOGLE_OAUTH_ACCESS_TOKEN",
  "GOOGLE_CALENDAR_ID",
  "ANTHROPIC_API_KEY",
  "AI_GATEWAY_URL",
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) snap[k] = (environment as Record<string, string | undefined>)[k];
  return snap;
}
function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete (environment as Record<string, string | undefined>)[k];
    else (environment as Record<string, string | undefined>)[k] = snap[k];
  }
}
function clearEnv() {
  for (const k of ENV_KEYS) delete (environment as Record<string, string | undefined>)[k];
}

async function wipeRepos(tenantId: string) {
  for (const repo of [applicationRepository, candidateRepository, scorecardRepository, interviewRepository]) {
    const page = await repo.list(tenantId, { limit: 200 });
    for (const r of page.items) await repo.delete(tenantId, r.id);
  }
}

async function seedApplication(
  tenantId: string,
  overrides: Partial<Application> = {},
): Promise<Application> {
  return applicationRepository.create(tenantId, {
    candidateId: "cand-1",
    jobId: "job-1",
    stage: "applied",
    stageEnteredAt: "2026-05-01T00:00:00Z",
    source: "linkedin",
    resumeUrl: null,
    score: null,
    createdAt: "2026-05-01T00:00:00Z",
    ...overrides,
  });
}

async function seedCandidate(
  tenantId: string,
  overrides: Partial<Candidate> = {},
): Promise<Candidate> {
  return candidateRepository.create(tenantId, {
    firstName: "Maria",
    lastName: "Lopez",
    email: "maria@example.com",
    phone: null,
    linkedinUrl: null,
    currentTitle: "Engineer",
    createdAt: "2026-05-01T00:00:00Z",
    ...overrides,
  });
}

async function seedScorecard(
  tenantId: string,
  overrides: Partial<Scorecard> = {},
): Promise<Scorecard> {
  return scorecardRepository.create(tenantId, {
    interviewId: "int-1",
    applicationId: "app-1",
    interviewerEmail: "interviewer@kit.test",
    ratings: { problemSolving: 4, communication: 5 },
    recommendation: "yes",
    notes: "Strong communicator",
    createdAt: "2026-05-15T00:00:00Z",
    ...overrides,
  });
}

const routes = {
  "GET /applications": listApplications,
  "GET /applications/{id}": getApplication,
};

function fakeClaude(text: string) {
  return new Response(
    JSON.stringify({
      id: "msg_x",
      model: "claude-sonnet-4-7-20251022",
      stop_reason: "end_turn",
      content: [{ type: "text", text }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
    { status: 200 },
  );
}

describe("orchestrator: summarize_candidate", () => {
  let snap: Record<string, string | undefined>;
  const tenantId = "tenant-summary";

  beforeEach(async () => {
    snap = snapshotEnv();
    clearEnv();
    await wipeRepos(tenantId);
    await wipeRepos("other-tenant");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    restoreEnv(snap);
    await wipeRepos(tenantId);
    await wipeRepos("other-tenant");
  });

  it("returns timeline + scorecards without calling Claude when generateBrief is false", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const cand = await seedCandidate(tenantId, { firstName: "Alex" });
    const app = await seedApplication(tenantId, { candidateId: cand.id });
    await seedScorecard(tenantId, { applicationId: app.id });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/summarize-candidate",
      method: "POST",
      tenantId,
      body: { candidateId: cand.id },
    });

    const res = await summarizeCandidate(request, context);
    const body = await res.json();
    expect(body.candidate.id).toBe(cand.id);
    expect(body.applicationCount).toBe(1);
    expect(body.scorecardCount).toBe(1);
    expect(body.brief).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls Claude when generateBrief is true", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeClaude("Hiring brief content"));

    const cand = await seedCandidate(tenantId);
    const app = await seedApplication(tenantId, { candidateId: cand.id });
    await seedScorecard(tenantId, { applicationId: app.id });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/summarize-candidate",
      method: "POST",
      tenantId,
      body: { candidateId: cand.id, generateBrief: true, briefTone: "advocate" },
    });

    const res = await summarizeCandidate(request, context);
    const body = await res.json();
    expect(body.brief.text).toBe("Hiring brief content");
    expect(body.brief.tone).toBe("advocate");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
  });

  it("uses AI_GATEWAY_URL when configured", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    (environment as Record<string, string | undefined>).AI_GATEWAY_URL =
      "https://gw.example.com/p";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(fakeClaude("brief"));

    const cand = await seedCandidate(tenantId);
    await seedApplication(tenantId, { candidateId: cand.id });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/summarize-candidate",
      method: "POST",
      tenantId,
      body: { candidateId: cand.id, generateBrief: true },
    });

    await summarizeCandidate(request, context);
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://gw.example.com/p/v1/messages");
  });

  it("captures Claude failure into brief.text without throwing", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );

    const cand = await seedCandidate(tenantId);
    await seedApplication(tenantId, { candidateId: cand.id });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/summarize-candidate",
      method: "POST",
      tenantId,
      body: { candidateId: cand.id, generateBrief: true },
    });

    const res = await summarizeCandidate(request, context);
    const body = await res.json();
    expect(body.brief.text).toContain("Claude brief unavailable");
  });

  it("isolates tenants — does not include other tenants' applications", async () => {
    const cand = await seedCandidate(tenantId);
    await seedApplication(tenantId, { candidateId: cand.id });
    await seedApplication("other-tenant", { candidateId: cand.id });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/summarize-candidate",
      method: "POST",
      tenantId,
      body: { candidateId: cand.id },
    });

    const res = await summarizeCandidate(request, context);
    const body = await res.json();
    expect(body.applicationCount).toBe(1);
  });

  it("returns 400 when candidateId is missing", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/summarize-candidate",
      method: "POST",
      tenantId,
      body: {},
    });
    const res = await summarizeCandidate(request, context);
    expect(res.status).toBe(400);
  });
});

describe("orchestrator: compare_candidates", () => {
  const tenantId = "tenant-compare";

  beforeEach(async () => {
    await wipeRepos(tenantId);
    await wipeRepos("other-tenant");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await wipeRepos(tenantId);
    await wipeRepos("other-tenant");
  });

  it("aggregates scorecards across the requested applications", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const app1 = await seedApplication(tenantId, { candidateId: "c1" });
    const app2 = await seedApplication(tenantId, { candidateId: "c2" });
    await seedScorecard(tenantId, {
      applicationId: app1.id,
      ratings: { problemSolving: 4 },
      recommendation: "yes",
    });
    await seedScorecard(tenantId, {
      applicationId: app1.id,
      ratings: { problemSolving: 5 },
      recommendation: "strong_yes",
    });
    await seedScorecard(tenantId, {
      applicationId: app2.id,
      ratings: { problemSolving: 2 },
      recommendation: "no",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/compare-candidates",
      method: "POST",
      tenantId,
      body: { applicationIds: [app1.id, app2.id] },
    });

    const res = await compareCandidates(request, context);
    const body = await res.json();
    expect(body.comparisons).toHaveLength(2);
    const byId = Object.fromEntries(
      body.comparisons.map((r: { applicationId: string }) => [r.applicationId, r]),
    );
    expect(byId[app1.id].avgRatingsByCompetency.problemSolving).toBe(4.5);
    expect(byId[app1.id].recommendationCounts.yes).toBe(1);
    expect(byId[app1.id].recommendationCounts.strong_yes).toBe(1);
    expect(byId[app2.id].avgRatingsByCompetency.problemSolving).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("handles applications with no scorecards (no-op tolerance)", async () => {
    const app1 = await seedApplication(tenantId, { candidateId: "c1" });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/compare-candidates",
      method: "POST",
      tenantId,
      body: { applicationIds: [app1.id] },
    });

    const res = await compareCandidates(request, context);
    const body = await res.json();
    expect(body.comparisons[0].scorecardCount).toBe(0);
  });

  it("returns 400 when applicationIds is empty", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/compare-candidates",
      method: "POST",
      tenantId,
      body: { applicationIds: [] },
    });
    const res = await compareCandidates(request, context);
    expect(res.status).toBe(400);
  });

  it("isolates tenants — only resolves the requesting tenant's applications", async () => {
    const app1 = await seedApplication(tenantId, { candidateId: "c1" });
    const otherApp = await seedApplication("other-tenant", { candidateId: "c1" });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/compare-candidates",
      method: "POST",
      tenantId,
      body: { applicationIds: [app1.id, otherApp.id] },
    });

    const res = await compareCandidates(request, context);
    const body = await res.json();
    // Only the in-tenant app should resolve via the get-application route.
    expect(body.comparisons).toHaveLength(1);
    expect(body.comparisons[0].applicationId).toBe(app1.id);
  });
});

describe("orchestrator: pipeline_health_for_job", () => {
  const tenantId = "tenant-pipeline";

  beforeEach(async () => {
    await wipeRepos(tenantId);
    await wipeRepos("other-tenant");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await wipeRepos(tenantId);
    await wipeRepos("other-tenant");
  });

  it("counts applications per stage and computes time-in-stage averages", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const now = Date.now();
    await seedApplication(tenantId, {
      jobId: "job-7",
      stage: "phone_screen",
      stageEnteredAt: new Date(now - 7 * 86_400_000).toISOString(),
    });
    await seedApplication(tenantId, {
      jobId: "job-7",
      stage: "phone_screen",
      stageEnteredAt: new Date(now - 14 * 86_400_000).toISOString(),
    });
    await seedApplication(tenantId, {
      jobId: "job-7",
      stage: "applied",
      stageEnteredAt: new Date(now - 1 * 86_400_000).toISOString(),
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/pipeline-health-for-job",
      method: "POST",
      tenantId,
      body: { jobId: "job-7" },
    });

    const res = await pipelineHealthForJob(request, context);
    const body = await res.json();
    expect(body.totalApplications).toBe(3);
    const phone = body.stages.find((s: { stage: string }) => s.stage === "phone_screen");
    expect(phone.count).toBe(2);
    expect(phone.avgDaysInStage).toBeGreaterThan(9);
    expect(phone.avgDaysInStage).toBeLessThanOrEqual(11);
    const applied = body.stages.find((s: { stage: string }) => s.stage === "applied");
    expect(applied.count).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns zero counts gracefully when no applications exist (no-op)", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/pipeline-health-for-job",
      method: "POST",
      tenantId,
      body: { jobId: "job-empty" },
    });

    const res = await pipelineHealthForJob(request, context);
    const body = await res.json();
    expect(body.totalApplications).toBe(0);
    for (const s of body.stages) expect(s.count).toBe(0);
  });

  it("isolates tenants", async () => {
    await seedApplication(tenantId, {
      jobId: "job-x",
      stage: "applied",
      stageEnteredAt: new Date().toISOString(),
    });
    await seedApplication("other-tenant", {
      jobId: "job-x",
      stage: "applied",
      stageEnteredAt: new Date().toISOString(),
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/pipeline-health-for-job",
      method: "POST",
      tenantId,
      body: { jobId: "job-x" },
    });

    const res = await pipelineHealthForJob(request, context);
    const body = await res.json();
    expect(body.totalApplications).toBe(1);
  });

  it("returns 400 when jobId is missing", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/pipeline-health-for-job",
      method: "POST",
      tenantId,
      body: {},
    });
    const res = await pipelineHealthForJob(request, context);
    expect(res.status).toBe(400);
  });
});

describe("handler: schedule_interview (Google Calendar fan-out)", () => {
  let snap: Record<string, string | undefined>;
  const tenantId = "tenant-schedule";

  beforeEach(async () => {
    snap = snapshotEnv();
    clearEnv();
    await wipeRepos(tenantId);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    restoreEnv(snap);
    await wipeRepos(tenantId);
  });

  it("creates a Calendar event when candidateEmail provided", async () => {
    (environment as Record<string, string | undefined>).GOOGLE_OAUTH_ACCESS_TOKEN = "ya29.tok";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "evt_1",
          htmlLink: "https://calendar.google.com/event?eid=abc",
          status: "confirmed",
        }),
        { status: 200 },
      ),
    );

    const request = makeRequest({
      url: "https://kit.test/interviews",
      method: "POST",
      tenantId,
      body: {
        applicationId: "app-1",
        scheduledAt: "2026-06-14T10:00:00Z",
        kind: "phone",
        interviewerEmail: "i@kit.test",
        candidateEmail: "c@kit.test",
        durationMinutes: 30,
      },
    });
    const { context } = makeContext({ tenantId });
    const res = await scheduleInterview(request, context);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.calendarEventId).toBe("evt_1");
    expect(body.calendarEventLink).toBe("https://calendar.google.com/event?eid=abc");
    expect(body.calendarError).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does NOT create a Calendar event when candidateEmail is not provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const request = makeRequest({
      url: "https://kit.test/interviews",
      method: "POST",
      tenantId,
      body: {
        applicationId: "app-1",
        scheduledAt: "2026-06-14T10:00:00Z",
        kind: "phone",
        interviewerEmail: "i@kit.test",
      },
    });
    const { context } = makeContext({ tenantId });
    const res = await scheduleInterview(request, context);
    const body = await res.json();
    expect(body.calendarEventId).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("captures Calendar failure on the Interview row without failing the request", async () => {
    (environment as Record<string, string | undefined>).GOOGLE_OAUTH_ACCESS_TOKEN = "ya29.tok";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Forbidden", { status: 403 }),
    );

    const request = makeRequest({
      url: "https://kit.test/interviews",
      method: "POST",
      tenantId,
      body: {
        applicationId: "app-1",
        scheduledAt: "2026-06-14T10:00:00Z",
        kind: "phone",
        interviewerEmail: "i@kit.test",
        candidateEmail: "c@kit.test",
      },
    });
    const { context } = makeContext({ tenantId });
    const res = await scheduleInterview(request, context);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.calendarEventId).toBeNull();
    expect(body.calendarError).toContain("403");
  });
});
