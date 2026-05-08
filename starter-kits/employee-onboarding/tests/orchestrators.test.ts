import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import checkOverdueTasks from "../modules/mcp-tools/check-overdue-tasks.ts";
import notifyBuddy from "../modules/mcp-tools/notify-buddy.ts";
import createOnboardingPlan from "../modules/mcp-tools/create-onboarding-plan.ts";
import listTasks from "../modules/handlers/list-tasks.ts";
import createTask from "../modules/handlers/create-task.ts";
import {
  hireRepository,
  type Hire,
} from "../modules/repositories/hires.ts";
import {
  onboardingTaskRepository,
  type OnboardingTask,
} from "../modules/repositories/onboarding-tasks.ts";
import {
  onboardingTemplateRepository,
  type OnboardingTemplate,
} from "../modules/repositories/onboarding-templates.ts";

const ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "SLACK_BOT_TOKEN",
  "SLACK_DEFAULT_CHANNEL",
  "SLACK_WEBHOOK_URL",
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
  for (const repo of [hireRepository, onboardingTaskRepository, onboardingTemplateRepository]) {
    const page = await repo.list(tenantId, { limit: 200 });
    for (const r of page.items) await repo.delete(tenantId, r.id);
  }
}

async function seedHire(tenantId: string, overrides: Partial<Hire> = {}): Promise<Hire> {
  return hireRepository.create(tenantId, {
    firstName: "Jordan",
    lastName: "Park",
    email: "jordan@kit.test",
    role: "Software Engineer",
    startDate: "2026-06-01",
    managerEmail: "mgr@kit.test",
    buddyEmail: "buddy@kit.test",
    status: "pre_start",
    createdAt: "2026-05-01T00:00:00Z",
    ...overrides,
  });
}

async function seedTask(tenantId: string, overrides: Partial<OnboardingTask> = {}): Promise<OnboardingTask> {
  return onboardingTaskRepository.create(tenantId, {
    hireId: "hire-1",
    title: "Provision laptop",
    description: "MacBook Pro 14",
    ownerEmail: "it@kit.test",
    dueDate: "2026-06-01",
    status: "open",
    category: "it",
    dependsOn: [],
    completedAt: null,
    createdAt: "2026-05-01T00:00:00Z",
    ...overrides,
  });
}

async function seedTemplate(tenantId: string, overrides: Partial<OnboardingTemplate> = {}): Promise<OnboardingTemplate> {
  return onboardingTemplateRepository.create(tenantId, {
    name: "Engineering",
    role: "Software Engineer",
    tasks: [
      {
        title: "Provision laptop",
        description: "MacBook Pro 14",
        ownerEmail: "it@kit.test",
        category: "it",
        daysFromStart: -3,
        dependsOnTitles: [],
      },
      {
        title: "Welcome lunch",
        description: "Welcome lunch with team",
        ownerEmail: "buddy@kit.test",
        category: "buddy",
        daysFromStart: 1,
        dependsOnTitles: ["Provision laptop"],
      },
    ],
    createdAt: "2026-05-01T00:00:00Z",
    ...overrides,
  });
}

const routes = {
  "GET /tasks": listTasks,
  "POST /tasks": createTask,
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

describe("orchestrator: check_overdue_tasks", () => {
  const tenantId = "tenant-overdue";

  beforeEach(async () => {
    await wipeRepos(tenantId);
    await wipeRepos("other-tenant");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await wipeRepos(tenantId);
    await wipeRepos("other-tenant");
  });

  it("returns overdue tasks grouped by ownerEmail (no fetch)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await seedTask(tenantId, {
      hireId: "hire-1",
      title: "Old task",
      ownerEmail: "it@kit.test",
      dueDate: "2020-01-01",
      status: "open",
    });
    await seedTask(tenantId, {
      hireId: "hire-1",
      title: "Old task 2",
      ownerEmail: "hr@kit.test",
      dueDate: "2020-01-01",
      status: "open",
    });
    // Done — should be excluded.
    await seedTask(tenantId, {
      hireId: "hire-1",
      title: "Completed",
      ownerEmail: "it@kit.test",
      dueDate: "2020-01-01",
      status: "done",
    });
    // Future task — not overdue.
    await seedTask(tenantId, {
      hireId: "hire-1",
      title: "Future",
      ownerEmail: "it@kit.test",
      dueDate: "2099-01-01",
      status: "open",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/check-overdue-tasks",
      method: "POST",
      tenantId,
      body: {},
    });

    const res = await checkOverdueTasks(request, context);
    const body = await res.json();
    expect(body.overdueCount).toBe(2);
    expect(body.byOwner).toHaveLength(2);
    const byOwner = Object.fromEntries(
      body.byOwner.map((g: { ownerEmail: string; count: number }) => [g.ownerEmail, g.count]),
    );
    expect(byOwner["it@kit.test"]).toBe(1);
    expect(byOwner["hr@kit.test"]).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns zero overdue gracefully when nothing is overdue (no-op)", async () => {
    await seedTask(tenantId, { dueDate: "2099-12-31", status: "open" });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/check-overdue-tasks",
      method: "POST",
      tenantId,
      body: {},
    });

    const res = await checkOverdueTasks(request, context);
    const body = await res.json();
    expect(body.overdueCount).toBe(0);
    expect(body.byOwner).toEqual([]);
  });

  it("filters to a single hireId when provided", async () => {
    await seedTask(tenantId, { hireId: "hire-A", dueDate: "2020-01-01", status: "open" });
    await seedTask(tenantId, { hireId: "hire-B", dueDate: "2020-01-01", status: "open" });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/check-overdue-tasks",
      method: "POST",
      tenantId,
      body: { hireId: "hire-A" },
    });

    const res = await checkOverdueTasks(request, context);
    const body = await res.json();
    expect(body.overdueCount).toBe(1);
  });

  it("isolates tenants", async () => {
    await seedTask(tenantId, { dueDate: "2020-01-01", status: "open" });
    await seedTask("other-tenant", { dueDate: "2020-01-01", status: "open" });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/check-overdue-tasks",
      method: "POST",
      tenantId,
      body: {},
    });

    const res = await checkOverdueTasks(request, context);
    const body = await res.json();
    expect(body.overdueCount).toBe(1);
  });
});

describe("orchestrator: notify_buddy", () => {
  let snap: Record<string, string | undefined>;
  const tenantId = "tenant-buddy";

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

  it("looks up the buddy, opens DM, and posts the checklist", async () => {
    (environment as Record<string, string | undefined>).SLACK_BOT_TOKEN = "xoxb-test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("users.lookupByEmail")) {
        return new Response(
          JSON.stringify({ ok: true, user: { id: "U_BUDDY" } }),
          { status: 200 },
        );
      }
      if (u.includes("conversations.open")) {
        return new Response(
          JSON.stringify({ ok: true, channel: { id: "D123" } }),
          { status: 200 },
        );
      }
      if (u.includes("chat.postMessage")) {
        return new Response(
          JSON.stringify({ ok: true, channel: "D123", ts: "1.2" }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected URL: ${u}`);
    });

    const hire = await seedHire(tenantId, { startDate: "2026-06-01" });
    await seedTask(tenantId, {
      hireId: hire.id,
      title: "Welcome lunch",
      category: "buddy",
      dueDate: "2026-06-02",
    });
    await seedTask(tenantId, {
      hireId: hire.id,
      title: "Coffee chat",
      category: "buddy",
      dueDate: "2026-06-04",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/notify-buddy",
      method: "POST",
      tenantId,
      body: { hireId: hire.id },
    });

    const res = await notifyBuddy(request, context);
    const body = await res.json();
    expect(body.buddy.slackUserId).toBe("U_BUDDY");
    expect(body.buddy.dmChannel).toBe("D123");
    expect(body.taskCount).toBe(2);
    expect(body.post.sent).toBe(true);
    // Three Slack calls: lookup, open, postMessage
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("does not call Slack when dryRun is true (drafts-only)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const hire = await seedHire(tenantId, { startDate: "2026-06-01" });
    await seedTask(tenantId, {
      hireId: hire.id,
      title: "Task",
      category: "buddy",
      dueDate: "2026-06-02",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/notify-buddy",
      method: "POST",
      tenantId,
      body: { hireId: hire.id, dryRun: true },
    });

    const res = await notifyBuddy(request, context);
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.post).toBeUndefined();
    expect(body.message.text).toContain("Buddy check-in");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 404 when hire not found", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/notify-buddy",
      method: "POST",
      tenantId,
      body: { hireId: "missing" },
    });
    const res = await notifyBuddy(request, context);
    expect(res.status).toBe(404);
  });

  it("returns 409 when hire has no buddyEmail", async () => {
    const hire = await seedHire(tenantId, { buddyEmail: null });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/notify-buddy",
      method: "POST",
      tenantId,
      body: { hireId: hire.id },
    });
    const res = await notifyBuddy(request, context);
    expect(res.status).toBe(409);
  });

  it("captures Slack lookup failure on the response without throwing", async () => {
    (environment as Record<string, string | undefined>).SLACK_BOT_TOKEN = "xoxb-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "users_not_found" }), {
        status: 200,
      }),
    );
    const hire = await seedHire(tenantId);

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/notify-buddy",
      method: "POST",
      tenantId,
      body: { hireId: hire.id },
    });

    const res = await notifyBuddy(request, context);
    const body = await res.json();
    expect(body.post.sent).toBe(false);
    expect(body.post.error).toContain("users_not_found");
  });

  it("isolates tenants — does not pull tasks for other tenants", async () => {
    (environment as Record<string, string | undefined>).SLACK_BOT_TOKEN = "xoxb-test";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("users.lookupByEmail"))
        return new Response(
          JSON.stringify({ ok: true, user: { id: "U_BUDDY" } }),
          { status: 200 },
        );
      if (u.includes("conversations.open"))
        return new Response(
          JSON.stringify({ ok: true, channel: { id: "D1" } }),
          { status: 200 },
        );
      if (u.includes("chat.postMessage"))
        return new Response(
          JSON.stringify({ ok: true, channel: "D1", ts: "1.2" }),
          { status: 200 },
        );
      throw new Error(`Unexpected URL: ${u}`);
    });

    const hire = await seedHire(tenantId);
    const otherHire = await seedHire("other-tenant");
    await seedTask(tenantId, {
      hireId: hire.id,
      category: "buddy",
      dueDate: hire.startDate,
    });
    await seedTask("other-tenant", {
      hireId: otherHire.id,
      category: "buddy",
      dueDate: otherHire.startDate,
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/notify-buddy",
      method: "POST",
      tenantId,
      body: { hireId: hire.id },
    });

    const res = await notifyBuddy(request, context);
    const body = await res.json();
    expect(body.taskCount).toBe(1);
  });
});

describe("orchestrator: create_onboarding_plan", () => {
  let snap: Record<string, string | undefined>;
  const tenantId = "tenant-plan";

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

  it("creates one task per template entry and resolves dependsOnTitles", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const hire = await seedHire(tenantId, { startDate: "2026-06-01" });
    const template = await seedTemplate(tenantId);

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/create-onboarding-plan",
      method: "POST",
      tenantId,
      body: { hireId: hire.id, templateId: template.id },
    });

    const res = await createOnboardingPlan(request, context);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tasksCreated).toBe(2);
    const dueByTitle = Object.fromEntries(
      body.tasks.map((t: { title: string; dueDate: string; dependsOn: string[] }) => [
        t.title,
        { dueDate: t.dueDate, dependsOn: t.dependsOn },
      ]),
    );
    expect(dueByTitle["Provision laptop"].dueDate).toBe("2026-05-29");
    expect(dueByTitle["Welcome lunch"].dueDate).toBe("2026-06-02");
    // dependsOn was resolved to the new task's id
    expect(dueByTitle["Welcome lunch"].dependsOn).toHaveLength(1);
    expect(body.plan306090).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls Claude when generate306090 is true", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(fakeClaude("## First 30 days..."));

    const hire = await seedHire(tenantId);
    const template = await seedTemplate(tenantId);

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/create-onboarding-plan",
      method: "POST",
      tenantId,
      body: {
        hireId: hire.id,
        templateId: template.id,
        generate306090: true,
        level: "IC3",
      },
    });

    const res = await createOnboardingPlan(request, context);
    const body = await res.json();
    expect(body.plan306090.text).toContain("First 30 days");
    const claudeCalls = fetchSpy.mock.calls.filter((c) =>
      typeof c[0] === "string" && (c[0] as string).startsWith("https://api.anthropic.com"),
    );
    expect(claudeCalls).toHaveLength(1);
  });

  it("uses AI_GATEWAY_URL when configured", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    (environment as Record<string, string | undefined>).AI_GATEWAY_URL =
      "https://gw.example.com/p";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(fakeClaude("plan"));

    const hire = await seedHire(tenantId);
    const template = await seedTemplate(tenantId);

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/create-onboarding-plan",
      method: "POST",
      tenantId,
      body: {
        hireId: hire.id,
        templateId: template.id,
        generate306090: true,
      },
    });

    await createOnboardingPlan(request, context);
    const gatewayCall = fetchSpy.mock.calls.find((c) =>
      typeof c[0] === "string" && (c[0] as string).startsWith("https://gw.example.com/p"),
    );
    expect(gatewayCall).toBeDefined();
  });

  it("returns 404 when hire is missing", async () => {
    const template = await seedTemplate(tenantId);
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/create-onboarding-plan",
      method: "POST",
      tenantId,
      body: { hireId: "nope", templateId: template.id },
    });
    const res = await createOnboardingPlan(request, context);
    expect(res.status).toBe(404);
  });

  it("returns 404 when template is missing", async () => {
    const hire = await seedHire(tenantId);
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/create-onboarding-plan",
      method: "POST",
      tenantId,
      body: { hireId: hire.id, templateId: "nope" },
    });
    const res = await createOnboardingPlan(request, context);
    expect(res.status).toBe(404);
  });

  it("captures Claude failure into plan306090.text without throwing", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    const hire = await seedHire(tenantId);
    const template = await seedTemplate(tenantId);

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/create-onboarding-plan",
      method: "POST",
      tenantId,
      body: { hireId: hire.id, templateId: template.id, generate306090: true },
    });
    const res = await createOnboardingPlan(request, context);
    const body = await res.json();
    expect(body.plan306090.text).toContain("30/60/90 plan unavailable");
  });

  it("isolates tenants", async () => {
    const hire = await seedHire(tenantId);
    const template = await seedTemplate(tenantId);
    // Seed a parallel template under another tenant — the orchestrator must
    // resolve the template ID against tenantId and not leak.
    await seedTemplate("other-tenant");

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/create-onboarding-plan",
      method: "POST",
      tenantId,
      body: { hireId: hire.id, templateId: template.id },
    });

    const res = await createOnboardingPlan(request, context);
    const body = await res.json();
    expect(body.tasksCreated).toBe(2);

    // No tasks should exist in the other tenant.
    const otherTasks = await onboardingTaskRepository.list("other-tenant", { limit: 200 });
    expect(otherTasks.items).toHaveLength(0);
  });
});
