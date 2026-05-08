import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import findUnbilledHours from "../modules/mcp-tools/find-unbilled-hours.ts";
import submitWeeklyTimesheet from "../modules/mcp-tools/submit-weekly-timesheet.ts";
import chaseUnbilledHours from "../modules/mcp-tools/chase-unbilled-hours.ts";
import listTimeEntries from "../modules/handlers/list-time-entries.ts";
import {
  timeEntryRepository,
  type TimeEntry,
} from "../modules/repositories/time-entries.ts";
import { timesheetRepository } from "../modules/repositories/timesheets.ts";

const ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
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
  const te = await timeEntryRepository.list(tenantId, { limit: 200 });
  for (const r of te.items) await timeEntryRepository.delete(tenantId, r.id);
  const ts = await timesheetRepository.list(tenantId, { limit: 200 });
  for (const r of ts.items) await timesheetRepository.delete(tenantId, r.id);
}

async function seedTimeEntry(
  tenantId: string,
  overrides: Partial<TimeEntry> = {},
): Promise<TimeEntry> {
  return timeEntryRepository.create(tenantId, {
    employeeId: "emp-1",
    projectId: "proj-1",
    taskId: null,
    startTime: "2026-06-01T09:00:00Z",
    endTime: "2026-06-01T11:00:00Z",
    durationMinutes: 120,
    billable: true,
    description: "work",
    status: "draft",
    timesheetId: null,
    createdAt: "2026-06-01T11:00:00Z",
    ...overrides,
  });
}

const routes = {
  "GET /time-entries": listTimeEntries,
};

function fakeClaude(text: string) {
  return new Response(
    JSON.stringify({
      id: "msg_x",
      model: "claude-sonnet-4-7-20251022",
      stop_reason: "end_turn",
      content: [{ type: "text", text }],
      usage: { input_tokens: 50, output_tokens: 25 },
    }),
    { status: 200 },
  );
}

describe("orchestrator: find_unbilled_hours", () => {
  let snap: Record<string, string | undefined>;
  const tenantId = "tenant-find";

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

  it("groups draft billable entries by project (happy path, no fetch)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await seedTimeEntry(tenantId, { projectId: "p1", durationMinutes: 60, billable: true, status: "draft" });
    await seedTimeEntry(tenantId, { projectId: "p1", durationMinutes: 30, billable: true, status: "draft" });
    await seedTimeEntry(tenantId, { projectId: "p2", durationMinutes: 90, billable: true, status: "draft" });
    // Non-billable / submitted entries should be excluded by the list filter.
    await seedTimeEntry(tenantId, { projectId: "p1", durationMinutes: 60, billable: false, status: "draft" });
    await seedTimeEntry(tenantId, { projectId: "p1", durationMinutes: 60, billable: true, status: "submitted" });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/find-unbilled-hours",
      method: "POST",
      tenantId,
      body: {},
    });

    const res = await findUnbilledHours(request, context);
    const body = await res.json();
    expect(body.totalEntries).toBe(3);
    expect(body.totalMinutes).toBe(180);
    const byProject = body.byProject.sort((a: { projectId: string }, b: { projectId: string }) =>
      a.projectId.localeCompare(b.projectId),
    );
    expect(byProject[0].projectId).toBe("p1");
    expect(byProject[0].totalMinutes).toBe(90);
    expect(byProject[1].projectId).toBe("p2");
    expect(byProject[1].totalMinutes).toBe(90);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns zero results gracefully when nothing is unbilled (no-op)", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/find-unbilled-hours",
      method: "POST",
      tenantId,
      body: {},
    });

    const res = await findUnbilledHours(request, context);
    const body = await res.json();
    expect(body.totalEntries).toBe(0);
    expect(body.totalMinutes).toBe(0);
    expect(body.byProject).toEqual([]);
  });

  it("filters by projectId when provided", async () => {
    await seedTimeEntry(tenantId, { projectId: "p1", durationMinutes: 60, billable: true, status: "draft" });
    await seedTimeEntry(tenantId, { projectId: "p2", durationMinutes: 30, billable: true, status: "draft" });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/find-unbilled-hours",
      method: "POST",
      tenantId,
      body: { projectId: "p1" },
    });

    const res = await findUnbilledHours(request, context);
    const body = await res.json();
    expect(body.totalEntries).toBe(1);
    expect(body.totalMinutes).toBe(60);
  });

  it("isolates tenants", async () => {
    await seedTimeEntry(tenantId, { projectId: "p1", durationMinutes: 60, billable: true, status: "draft" });
    await seedTimeEntry("other-tenant", { projectId: "p1", durationMinutes: 999, billable: true, status: "draft" });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/find-unbilled-hours",
      method: "POST",
      tenantId,
      body: {},
    });

    const res = await findUnbilledHours(request, context);
    const body = await res.json();
    expect(body.totalMinutes).toBe(60);
  });
});

describe("orchestrator: submit_weekly_timesheet", () => {
  let snap: Record<string, string | undefined>;
  const tenantId = "tenant-submit";

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

  it("creates a Timesheet summing the week's entries", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await seedTimeEntry(tenantId, {
      employeeId: "emp-1",
      startTime: "2026-06-01T09:00:00Z",
      durationMinutes: 60,
    });
    await seedTimeEntry(tenantId, {
      employeeId: "emp-1",
      startTime: "2026-06-03T09:00:00Z",
      durationMinutes: 120,
    });
    // Outside the week — should NOT be included.
    await seedTimeEntry(tenantId, {
      employeeId: "emp-1",
      startTime: "2026-06-15T09:00:00Z",
      durationMinutes: 999,
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/submit-weekly-timesheet",
      method: "POST",
      tenantId,
      body: { employeeId: "emp-1", weekStartDate: "2026-06-01" },
    });

    const res = await submitWeeklyTimesheet(request, context);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entryCount).toBe(2);
    expect(body.totalMinutes).toBe(180);
    expect(body.timesheet.status).toBe("submitted");
    expect(body.timesheet.weekStartDate).toBe("2026-06-01");
    expect(fetchSpy).not.toHaveBeenCalled();

    const ts = await timesheetRepository.list(tenantId, { limit: 10 });
    expect(ts.items).toHaveLength(1);
  });

  it("creates a 0-minute timesheet when nothing is logged (no-op tolerance)", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/submit-weekly-timesheet",
      method: "POST",
      tenantId,
      body: { employeeId: "emp-1", weekStartDate: "2026-06-01" },
    });

    const res = await submitWeeklyTimesheet(request, context);
    const body = await res.json();
    expect(body.entryCount).toBe(0);
    expect(body.totalMinutes).toBe(0);
    expect(body.timesheet.totalMinutes).toBe(0);
  });

  it("returns 400 when employeeId or weekStartDate is missing", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/submit-weekly-timesheet",
      method: "POST",
      tenantId,
      body: { employeeId: "emp-1" },
    });
    const res = await submitWeeklyTimesheet(request, context);
    expect(res.status).toBe(400);
  });

  it("isolates tenants — only submits the requesting tenant's entries", async () => {
    await seedTimeEntry(tenantId, {
      employeeId: "emp-1",
      startTime: "2026-06-01T09:00:00Z",
      durationMinutes: 60,
    });
    await seedTimeEntry("other-tenant", {
      employeeId: "emp-1",
      startTime: "2026-06-01T09:00:00Z",
      durationMinutes: 999,
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/submit-weekly-timesheet",
      method: "POST",
      tenantId,
      body: { employeeId: "emp-1", weekStartDate: "2026-06-01" },
    });

    const res = await submitWeeklyTimesheet(request, context);
    const body = await res.json();
    expect(body.totalMinutes).toBe(60);
  });
});

describe("orchestrator: chase_unbilled_hours", () => {
  let snap: Record<string, string | undefined>;
  const tenantId = "tenant-chase";

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

  it("drafts emails per employee using Claude (sendEmails: false)", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => fakeClaude("Hi there, please submit your timesheet."));

    await seedTimeEntry(tenantId, { employeeId: "emp-a", projectId: "p1", durationMinutes: 60 });
    await seedTimeEntry(tenantId, { employeeId: "emp-a", projectId: "p2", durationMinutes: 120 });
    await seedTimeEntry(tenantId, { employeeId: "emp-b", projectId: "p1", durationMinutes: 90 });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/chase-unbilled-hours",
      method: "POST",
      tenantId,
      body: {
        employeeNames: { "emp-a": "Anna", "emp-b": "Ben" },
      },
    });

    const res = await chaseUnbilledHours(request, context);
    const body = await res.json();
    expect(body.employeeCount).toBe(2);
    expect(body.sendsAttempted).toBe(false);
    // Two Claude calls (one per employee), no Resend calls.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const call of fetchSpy.mock.calls) {
      expect(call[0]).toBe("https://api.anthropic.com/v1/messages");
    }
    for (const draft of body.drafts) {
      expect(draft.draft.text).toContain("submit your timesheet");
      expect(draft.send).toBeNull();
    }
  });

  it("sends emails via Resend when sendEmails is true and address provided", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    (environment as Record<string, string | undefined>).RESEND_API_KEY = "re_test_key";
    (environment as Record<string, string | undefined>).RESEND_FROM_EMAIL = "ops@kit.test";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (typeof url === "string" && url.startsWith("https://api.anthropic.com")) {
        return fakeClaude("Body of nudge email");
      }
      if (typeof url === "string" && url.startsWith("https://api.resend.com")) {
        return new Response(JSON.stringify({ id: "msg_resend_1" }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    await seedTimeEntry(tenantId, { employeeId: "emp-a", projectId: "p1", durationMinutes: 120 });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/chase-unbilled-hours",
      method: "POST",
      tenantId,
      body: {
        sendEmails: true,
        employeeEmails: { "emp-a": "anna@kit.test" },
        employeeNames: { "emp-a": "Anna" },
      },
    });

    const res = await chaseUnbilledHours(request, context);
    const body = await res.json();
    expect(body.sendsAttempted).toBe(true);
    expect(body.drafts[0].send.sent).toBe(true);
    expect(body.drafts[0].send.id).toBe("msg_resend_1");

    // Verify Resend call
    const resendCall = fetchSpy.mock.calls.find((c) =>
      typeof c[0] === "string" && c[0].startsWith("https://api.resend.com"),
    );
    expect(resendCall).toBeDefined();
    const resendBody = JSON.parse((resendCall![1] as RequestInit).body as string);
    expect(resendBody.to).toBe("anna@kit.test");
  });

  it("does NOT call Resend when sendEmails: false (drafts-only path)", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeClaude("draft"));

    await seedTimeEntry(tenantId, { employeeId: "emp-a", projectId: "p1", durationMinutes: 120 });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/chase-unbilled-hours",
      method: "POST",
      tenantId,
      body: { sendEmails: false, employeeEmails: { "emp-a": "anna@kit.test" } },
    });

    await chaseUnbilledHours(request, context);
    const resendCalls = fetchSpy.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].startsWith("https://api.resend.com"),
    );
    expect(resendCalls).toHaveLength(0);
  });

  it("returns drafts but no sends when sendEmails=true with no email mapping", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(fakeClaude("draft"));
    await seedTimeEntry(tenantId, { employeeId: "emp-a", projectId: "p1", durationMinutes: 120 });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/chase-unbilled-hours",
      method: "POST",
      tenantId,
      body: { sendEmails: true },
    });

    const res = await chaseUnbilledHours(request, context);
    const body = await res.json();
    expect(body.drafts[0].send.sent).toBe(false);
    expect(body.drafts[0].send.error).toContain("No email address");
  });

  it("no-op when there are no unbilled entries above minHours", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // Only 0.5 hours total — below default minHours: 1
    await seedTimeEntry(tenantId, { employeeId: "emp-a", projectId: "p1", durationMinutes: 30 });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/chase-unbilled-hours",
      method: "POST",
      tenantId,
      body: {},
    });

    const res = await chaseUnbilledHours(request, context);
    const body = await res.json();
    expect(body.employeeCount).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to a static draft when Claude fails", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );
    await seedTimeEntry(tenantId, { employeeId: "emp-a", projectId: "p1", durationMinutes: 120 });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/chase-unbilled-hours",
      method: "POST",
      tenantId,
      body: {},
    });

    const res = await chaseUnbilledHours(request, context);
    const body = await res.json();
    expect(body.drafts[0].draft.model).toBe("fallback");
    expect(body.drafts[0].draft.text).toContain("Auto-fallback");
  });

  it("isolates tenants", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(fakeClaude("draft"));
    await seedTimeEntry(tenantId, { employeeId: "emp-a", projectId: "p1", durationMinutes: 120 });
    await seedTimeEntry("other-tenant", { employeeId: "evil", projectId: "p9", durationMinutes: 999 });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/chase-unbilled-hours",
      method: "POST",
      tenantId,
      body: {},
    });

    const res = await chaseUnbilledHours(request, context);
    const body = await res.json();
    expect(body.employeeCount).toBe(1);
    expect(body.drafts[0].employeeId).toBe("emp-a");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
