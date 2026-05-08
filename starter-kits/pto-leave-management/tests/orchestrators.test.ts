import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import findOverlappingPto from "../modules/mcp-tools/find-overlapping-pto.ts";
import checkLeaveBalance from "../modules/mcp-tools/check-leave-balance.ts";
import listLeaveRequests from "../modules/handlers/list-leave-requests.ts";
import createLeaveRequest from "../modules/handlers/create-leave-request.ts";
import {
  leaveRequestRepository,
  type LeaveRequest,
} from "../modules/repositories/leave-requests.ts";
import {
  leaveBalanceRepository,
  type LeaveBalance,
} from "../modules/repositories/leave-balances.ts";

const ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "SLACK_BOT_TOKEN",
  "SLACK_DEFAULT_CHANNEL",
  "SLACK_WEBHOOK_URL",
  "ANTHROPIC_API_KEY",
  "AI_GATEWAY_URL",
] as const;

function clearEnv() {
  for (const k of ENV_KEYS) delete (environment as Record<string, string | undefined>)[k];
}

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

/** Wipe both in-memory repos for a tenant by deleting every record. */
async function wipeRepos(tenantId: string) {
  const lr = await leaveRequestRepository.list(tenantId, { limit: 200 });
  for (const r of lr.items) await leaveRequestRepository.delete(tenantId, r.id);
  const lb = await leaveBalanceRepository.list(tenantId, { limit: 200 });
  for (const b of lb.items) await leaveBalanceRepository.delete(tenantId, b.id);
}

async function seedLeaveRequest(
  tenantId: string,
  overrides: Partial<LeaveRequest> = {},
): Promise<LeaveRequest> {
  return leaveRequestRepository.create(tenantId, {
    employeeId: "emp-1",
    startDate: "2026-06-01",
    endDate: "2026-06-05",
    type: "vacation",
    status: "approved",
    reason: "vacay",
    days: 5,
    approvedBy: "mgr@example.com",
    approvedAt: "2026-05-01T00:00:00Z",
    createdAt: "2026-05-01T00:00:00Z",
    ...overrides,
  });
}

async function seedLeaveBalance(
  tenantId: string,
  overrides: Partial<LeaveBalance> = {},
): Promise<LeaveBalance> {
  return leaveBalanceRepository.create(tenantId, {
    employeeId: "emp-1",
    type: "vacation",
    balanceDays: 12,
    accruedYtd: 8,
    updatedAt: "2026-05-01T00:00:00Z",
    ...overrides,
  });
}

const routes = {
  "GET /leave-requests": listLeaveRequests,
  "POST /leave-requests": createLeaveRequest,
};

describe("orchestrator: find_overlapping_pto", () => {
  let snap: Record<string, string | undefined>;
  const tenantId = "tenant-overlap";

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

  it("finds overlaps and returns conflicts; no Slack call when notifyManager is false", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await seedLeaveRequest(tenantId, {
      employeeId: "emp-1",
      startDate: "2026-06-10",
      endDate: "2026-06-14",
      status: "approved",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/find-overlapping-pto",
      method: "POST",
      tenantId,
      body: {
        teamMemberIds: ["emp-1"],
        startDate: "2026-06-12",
        endDate: "2026-06-20",
      },
    });

    const res = await findOverlappingPto(request, context);
    const body = await res.json();
    expect(body.conflictCount).toBe(1);
    expect(body.conflicts[0].employeeId).toBe("emp-1");
    expect(body.notification).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts a Slack message when notifyManager is true and conflicts exist", async () => {
    (environment as Record<string, string | undefined>).SLACK_BOT_TOKEN = "xoxb-test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, channel: "C1", ts: "1.2" }), {
          status: 200,
        }),
      );

    await seedLeaveRequest(tenantId, {
      employeeId: "emp-1",
      startDate: "2026-06-10",
      endDate: "2026-06-14",
      status: "approved",
    });
    await seedLeaveRequest(tenantId, {
      employeeId: "emp-2",
      startDate: "2026-06-13",
      endDate: "2026-06-15",
      status: "pending",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/find-overlapping-pto",
      method: "POST",
      tenantId,
      body: {
        teamMemberIds: ["emp-1", "emp-2"],
        startDate: "2026-06-12",
        endDate: "2026-06-20",
        notifyManager: true,
        managerSlackChannel: "#staffing",
        teamName: "Alpha team",
      },
    });

    const res = await findOverlappingPto(request, context);
    const body = await res.json();
    expect(body.conflictCount).toBe(2);
    expect(body.notification.sent).toBe(true);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const slackBody = JSON.parse((init as RequestInit).body as string);
    expect(slackBody.channel).toBe("#staffing");
    expect(slackBody.text).toContain("Alpha team");
    expect(slackBody.text).toContain("emp-1");
    expect(slackBody.text).toContain("emp-2");
  });

  it("does not post Slack when no conflicts found (no-op)", async () => {
    (environment as Record<string, string | undefined>).SLACK_BOT_TOKEN = "xoxb-test";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await seedLeaveRequest(tenantId, {
      employeeId: "emp-1",
      startDate: "2026-01-01",
      endDate: "2026-01-05",
      status: "approved",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/find-overlapping-pto",
      method: "POST",
      tenantId,
      body: {
        teamMemberIds: ["emp-1"],
        startDate: "2026-06-12",
        endDate: "2026-06-20",
        notifyManager: true,
        managerSlackChannel: "#staffing",
      },
    });

    const res = await findOverlappingPto(request, context);
    const body = await res.json();
    expect(body.conflictCount).toBe(0);
    expect(body.notification).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("captures Slack failure on the response without throwing", async () => {
    (environment as Record<string, string | undefined>).SLACK_BOT_TOKEN = "xoxb-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), {
        status: 200,
      }),
    );
    await seedLeaveRequest(tenantId, {
      employeeId: "emp-1",
      startDate: "2026-06-10",
      endDate: "2026-06-14",
      status: "approved",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/find-overlapping-pto",
      method: "POST",
      tenantId,
      body: {
        teamMemberIds: ["emp-1"],
        startDate: "2026-06-12",
        endDate: "2026-06-20",
        notifyManager: true,
        managerSlackChannel: "#nope",
      },
    });

    const res = await findOverlappingPto(request, context);
    const body = await res.json();
    expect(body.conflictCount).toBe(1);
    expect(body.notification.sent).toBe(false);
    expect(body.notification.error).toContain("channel_not_found");
  });

  it("isolates tenants — only sees data for the requesting tenant", async () => {
    await seedLeaveRequest(tenantId, {
      employeeId: "emp-1",
      startDate: "2026-06-10",
      endDate: "2026-06-14",
      status: "approved",
    });
    await seedLeaveRequest("other-tenant", {
      employeeId: "emp-1",
      startDate: "2026-06-12",
      endDate: "2026-06-18",
      status: "approved",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/find-overlapping-pto",
      method: "POST",
      tenantId,
      body: {
        teamMemberIds: ["emp-1"],
        startDate: "2026-06-12",
        endDate: "2026-06-20",
      },
    });

    const res = await findOverlappingPto(request, context);
    const body = await res.json();
    expect(body.conflictCount).toBe(1);
  });

  it("returns 400 when teamMemberIds is missing", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/find-overlapping-pto",
      method: "POST",
      tenantId,
      body: { startDate: "2026-06-12", endDate: "2026-06-20" },
    });
    const res = await findOverlappingPto(request, context);
    expect(res.status).toBe(400);
  });
});

describe("orchestrator: check_leave_balance", () => {
  let snap: Record<string, string | undefined>;
  const tenantId = "tenant-balance";

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

  it("returns balance map without calling Claude when draftReply is false", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await seedLeaveBalance(tenantId, { employeeId: "emp-1", type: "vacation", balanceDays: 10, accruedYtd: 7 });
    await seedLeaveBalance(tenantId, { employeeId: "emp-1", type: "sick", balanceDays: 5, accruedYtd: 3 });

    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/check-leave-balance",
      method: "POST",
      tenantId,
      body: { employeeId: "emp-1" },
    });

    const res = await checkLeaveBalance(request, context);
    const body = await res.json();
    expect(body.balances.vacation.balanceDays).toBe(10);
    expect(body.balances.sick.balanceDays).toBe(5);
    expect(body.draftedReply).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls Claude (api.anthropic.com) when draftReply is true", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_a",
          model: "claude-sonnet-4-7-20251022",
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Maria has 10 vacation days left." }],
          usage: { input_tokens: 50, output_tokens: 20 },
        }),
        { status: 200 },
      ),
    );

    await seedLeaveBalance(tenantId, { employeeId: "emp-1", type: "vacation", balanceDays: 10, accruedYtd: 7 });

    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/check-leave-balance",
      method: "POST",
      tenantId,
      body: { employeeId: "emp-1", draftReply: true, employeeName: "Maria" },
    });

    const res = await checkLeaveBalance(request, context);
    const body = await res.json();
    expect(body.draftedReply.text).toBe("Maria has 10 vacation days left.");
    expect(body.draftedReply.model).toBe("claude-sonnet-4-7-20251022");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
  });

  it("routes to AI_GATEWAY_URL when configured", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    (environment as Record<string, string | undefined>).AI_GATEWAY_URL =
      "https://gateway.example.com/proxy";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_b",
          model: "claude-sonnet-4-7-20251022",
          stop_reason: "end_turn",
          content: [{ type: "text", text: "ok" }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      ),
    );

    await seedLeaveBalance(tenantId);

    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/check-leave-balance",
      method: "POST",
      tenantId,
      body: { employeeId: "emp-1", draftReply: true },
    });

    await checkLeaveBalance(request, context);
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://gateway.example.com/proxy/v1/messages");
  });

  it("captures Claude failure into draftedReply text without throwing", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limit", { status: 429 }),
    );
    await seedLeaveBalance(tenantId);

    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/check-leave-balance",
      method: "POST",
      tenantId,
      body: { employeeId: "emp-1", draftReply: true },
    });

    const res = await checkLeaveBalance(request, context);
    const body = await res.json();
    expect(body.draftedReply.text).toContain("Claude draft unavailable");
  });

  it("isolates tenants — does not return another tenant's balances", async () => {
    await seedLeaveBalance(tenantId, { employeeId: "emp-1", type: "vacation", balanceDays: 10, accruedYtd: 5 });
    await seedLeaveBalance("other-tenant", {
      employeeId: "emp-1",
      type: "vacation",
      balanceDays: 99,
      accruedYtd: 99,
    });

    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/check-leave-balance",
      method: "POST",
      tenantId,
      body: { employeeId: "emp-1" },
    });

    const res = await checkLeaveBalance(request, context);
    const body = await res.json();
    expect(body.balances.vacation.balanceDays).toBe(10);
  });

  it("returns 400 when employeeId is missing", async () => {
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/check-leave-balance",
      method: "POST",
      tenantId,
      body: {},
    });
    const res = await checkLeaveBalance(request, context);
    expect(res.status).toBe(400);
  });
});
