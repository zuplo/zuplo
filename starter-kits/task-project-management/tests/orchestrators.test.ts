import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import chaseStaleTasks from "../modules/mcp-tools/chase-stale-tasks.ts";
import rebalanceWorkload from "../modules/mcp-tools/rebalance-workload.ts";
import summarizeSprint from "../modules/mcp-tools/summarize-sprint.ts";
import listTasks from "../modules/handlers/list-tasks.ts";
import createTask from "../modules/handlers/create-task.ts";
import { taskRepository, type Task } from "../modules/repositories/tasks.ts";

/**
 * Orchestrator tests — exercise the wired MCP tools with a real route map and
 * an in-memory repository. Each test uses a unique tenant id so suite runs
 * remain hermetic.
 */

const env = environment as Record<string, string | undefined>;

async function seedTask(tenantId: string, overrides: Partial<Task> = {}) {
  const now = new Date().toISOString();
  return taskRepository.create(tenantId, {
    projectId: "proj-1",
    title: "Default task",
    description: "",
    assigneeEmail: "alice@example.com",
    priority: "med",
    status: "doing",
    dueDate: null,
    completedAt: null,
    parentTaskId: null,
    customFields: {},
    labels: [],
    estimateHours: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

const routes = {
  "GET /tasks": (req: import("@zuplo/runtime").ZuploRequest, ctx: import("@zuplo/runtime").ZuploContext) =>
    listTasks(req, ctx),
  "POST /tasks": (req: import("@zuplo/runtime").ZuploRequest, ctx: import("@zuplo/runtime").ZuploContext) =>
    createTask(req, ctx),
};

describe("orchestrator: chase_stale_tasks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete env.SLACK_WEBHOOK_URL;
    delete env.SLACK_BOT_TOKEN;
    delete env.SLACK_DEFAULT_CHANNEL;
  });

  it("returns stale tasks but does not call Slack when dispatch is omitted", async () => {
    const tenantId = "tenant-chase-1";
    const oldIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await seedTask(tenantId, { title: "stale doing", status: "doing", updatedAt: oldIso });
    await seedTask(tenantId, { title: "fresh doing", status: "doing", updatedAt: new Date().toISOString() });
    await seedTask(tenantId, { title: "old done", status: "done", updatedAt: oldIso });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/chase-stale-tasks",
      method: "POST",
      body: { daysWithoutActivity: 7 },
      tenantId,
    });

    const response = await chaseStaleTasks(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      count: number;
      dispatched: number;
      tasks: Array<{ task: { title: string } }>;
    };
    expect(json.count).toBe(1);
    expect(json.dispatched).toBe(0);
    expect(json.tasks[0].task.title).toBe("stale doing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dispatches one Slack message per assignee when dispatch=true", async () => {
    env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T/B/x";
    const tenantId = "tenant-chase-2";
    const oldIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await seedTask(tenantId, {
      title: "alice stale 1",
      status: "doing",
      assigneeEmail: "alice@example.com",
      updatedAt: oldIso,
    });
    await seedTask(tenantId, {
      title: "alice stale 2",
      status: "blocked",
      assigneeEmail: "alice@example.com",
      updatedAt: oldIso,
    });
    await seedTask(tenantId, {
      title: "bob stale",
      status: "doing",
      assigneeEmail: "bob@example.com",
      updatedAt: oldIso,
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/chase-stale-tasks",
      method: "POST",
      body: { dispatch: true, daysWithoutActivity: 7 },
      tenantId,
    });

    const response = await chaseStaleTasks(request, context);
    const json = (await response.json()) as {
      count: number;
      dispatched: number;
      dispatchErrors: string[];
    };

    expect(json.count).toBe(3);
    // Two distinct assignees → two Slack posts
    expect(json.dispatched).toBe(2);
    expect(json.dispatchErrors).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 0 stale tasks gracefully when nothing matches", async () => {
    const tenantId = "tenant-chase-3";
    await seedTask(tenantId, { status: "todo", title: "todo" });
    await seedTask(tenantId, { status: "done", title: "done" });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/chase-stale-tasks",
      method: "POST",
      body: { dispatch: true, daysWithoutActivity: 7 },
      tenantId,
    });

    const response = await chaseStaleTasks(request, context);
    const json = (await response.json()) as { count: number; dispatched: number };
    expect(json.count).toBe(0);
    expect(json.dispatched).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("scopes results to a single tenant — does not see another tenant's stale tasks", async () => {
    const tenantA = "tenant-chase-iso-a";
    const tenantB = "tenant-chase-iso-b";
    const oldIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await seedTask(tenantA, { title: "A's stale", status: "doing", updatedAt: oldIso });
    await seedTask(tenantB, { title: "B's stale", status: "doing", updatedAt: oldIso });

    const { context } = makeContext({ routes, tenantId: tenantA });
    const request = makeRequest({
      url: "https://kit.test/chase-stale-tasks",
      method: "POST",
      body: { daysWithoutActivity: 7 },
      tenantId: tenantA,
    });

    const response = await chaseStaleTasks(request, context);
    const json = (await response.json()) as {
      count: number;
      tasks: Array<{ task: { title: string } }>;
    };
    expect(json.count).toBe(1);
    expect(json.tasks[0].task.title).toBe("A's stale");
  });
});

describe("orchestrator: rebalance_workload", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns load breakdown and a swap suggestion when one assignee is heavy", async () => {
    const tenantId = "tenant-rebal-1";
    // Heavy: 3 high-priority tasks (default 8h each = 24h)
    for (let i = 0; i < 3; i++) {
      await seedTask(tenantId, {
        title: `heavy ${i}`,
        assigneeEmail: "alice@example.com",
        priority: "high",
        status: "todo",
      });
    }
    // Light: one low-priority task (default 1h)
    await seedTask(tenantId, {
      title: "light",
      assigneeEmail: "bob@example.com",
      priority: "low",
      status: "todo",
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/rebalance-workload",
      method: "POST",
      body: { projectId: "proj-1" },
      tenantId,
    });

    const response = await rebalanceWorkload(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      loads: Array<{ assigneeEmail: string; totalHours: number }>;
      suggestions: Array<{ fromEmail: string; toEmail: string }>;
    };

    expect(json.loads[0].assigneeEmail).toBe("alice@example.com");
    expect(json.loads[0].totalHours).toBe(24);
    expect(json.suggestions).toHaveLength(1);
    expect(json.suggestions[0].fromEmail).toBe("alice@example.com");
    expect(json.suggestions[0].toEmail).toBe("bob@example.com");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when projectId is missing", async () => {
    const { context } = makeContext({ routes, tenantId: "t-rebal-bad" });
    const request = makeRequest({
      url: "https://kit.test/rebalance-workload",
      method: "POST",
      body: {},
      tenantId: "t-rebal-bad",
    });

    const response = await rebalanceWorkload(request, context);
    expect(response.status).toBe(400);
  });

  it("makes no swap suggestion when load is balanced", async () => {
    const tenantId = "tenant-rebal-balanced";
    await seedTask(tenantId, { title: "a1", assigneeEmail: "a@x.com", priority: "med", status: "todo" });
    await seedTask(tenantId, { title: "b1", assigneeEmail: "b@x.com", priority: "med", status: "todo" });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/rebalance-workload",
      method: "POST",
      body: { projectId: "proj-1" },
      tenantId,
    });

    const response = await rebalanceWorkload(request, context);
    const json = (await response.json()) as {
      suggestions: unknown[];
    };
    expect(json.suggestions).toEqual([]);
  });

  it("does not see tasks from another tenant", async () => {
    const tenantA = "tenant-rebal-iso-a";
    const tenantB = "tenant-rebal-iso-b";
    await seedTask(tenantB, {
      title: "B alice 1",
      assigneeEmail: "alice@example.com",
      priority: "high",
      status: "todo",
    });

    const { context } = makeContext({ routes, tenantId: tenantA });
    const request = makeRequest({
      url: "https://kit.test/rebalance-workload",
      method: "POST",
      body: { projectId: "proj-1" },
      tenantId: tenantA,
    });

    const response = await rebalanceWorkload(request, context);
    const json = (await response.json()) as {
      loads: unknown[];
    };
    expect(json.loads).toEqual([]);
  });
});

describe("orchestrator: summarize_sprint", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns 400 when fromDate or toDate is missing", async () => {
    const { context } = makeContext({ routes, tenantId: "t-sum-bad" });
    const request = makeRequest({
      url: "https://kit.test/summarize-sprint",
      method: "POST",
      body: { projectId: "proj-1", fromDate: "2026-01-01" },
      tenantId: "t-sum-bad",
    });

    const response = await summarizeSprint(request, context);
    expect(response.status).toBe(400);
  });

  it("groups tasks into completed / openDueInWindow / blockers buckets", async () => {
    const tenantId = "tenant-sum-1";
    await seedTask(tenantId, {
      title: "done in window",
      status: "done",
      completedAt: "2026-01-15T00:00:00Z",
    });
    await seedTask(tenantId, {
      title: "due in window",
      status: "todo",
      dueDate: "2026-01-20T00:00:00Z",
    });
    await seedTask(tenantId, {
      title: "blocked",
      status: "blocked",
    });
    await seedTask(tenantId, {
      title: "out of window",
      status: "done",
      completedAt: "2025-01-15T00:00:00Z",
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/summarize-sprint",
      method: "POST",
      body: {
        projectId: "proj-1",
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
      },
      tenantId,
    });

    const response = await summarizeSprint(request, context);
    const json = (await response.json()) as {
      counts: { completed: number; openDueInWindow: number; blockers: number };
    };
    expect(json.counts.completed).toBe(1);
    expect(json.counts.openDueInWindow).toBe(1);
    expect(json.counts.blockers).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns empty buckets when nothing matches", async () => {
    const tenantId = "tenant-sum-empty";
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/summarize-sprint",
      method: "POST",
      body: {
        projectId: "proj-1",
        fromDate: "2026-06-01",
        toDate: "2026-06-30",
      },
      tenantId,
    });

    const response = await summarizeSprint(request, context);
    const json = (await response.json()) as {
      counts: { completed: number; openDueInWindow: number; blockers: number };
    };
    expect(json.counts.completed).toBe(0);
    expect(json.counts.openDueInWindow).toBe(0);
    expect(json.counts.blockers).toBe(0);
  });
});
