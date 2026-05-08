import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import requestPeerFeedback from "../modules/mcp-tools/request-peer-feedback.ts";
import trackGoalProgress from "../modules/mcp-tools/track-goal-progress.ts";
import summarizeFeedbackThemes from "../modules/mcp-tools/summarize-feedback-themes.ts";
import listReviews from "../modules/handlers/list-reviews.ts";
import createReview from "../modules/handlers/create-review.ts";
import listGoals from "../modules/handlers/list-goals.ts";
import {
  reviewRepository,
  type Review,
} from "../modules/repositories/reviews.ts";
import {
  goalRepository,
  type Goal,
} from "../modules/repositories/goals.ts";
import { reviewCycleRepository } from "../modules/repositories/review-cycles.ts";

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
  for (const repo of [reviewRepository, goalRepository, reviewCycleRepository]) {
    const page = await repo.list(tenantId, { limit: 200 });
    for (const r of page.items) await repo.delete(tenantId, r.id);
  }
}

async function seedReview(
  tenantId: string,
  overrides: Partial<Review> = {},
): Promise<Review> {
  return reviewRepository.create(tenantId, {
    revieweeEmail: "ree@kit.test",
    reviewerEmail: "rev@kit.test",
    cycleId: "cycle-2026-q1",
    kind: "peer",
    status: "submitted",
    ratings: { problemSolving: 4, communication: 5 },
    narrative: "Solid work on the API project",
    submittedAt: "2026-03-20T00:00:00Z",
    createdAt: "2026-03-15T00:00:00Z",
    ...overrides,
  });
}

async function seedGoal(
  tenantId: string,
  overrides: Partial<Goal> = {},
): Promise<Goal> {
  return goalRepository.create(tenantId, {
    employeeEmail: "emp@kit.test",
    title: "Ship project X",
    description: "By Q1",
    dueDate: "2026-03-31",
    progress: 50,
    status: "on_track",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  });
}

const routes = {
  "GET /reviews": listReviews,
  "POST /reviews": createReview,
  "GET /goals": listGoals,
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

describe("orchestrator: request_peer_feedback", () => {
  let snap: Record<string, string | undefined>;
  const tenantId = "tenant-peer";

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

  it("creates a draft Review per peer (sendInvites: false)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/request-peer-feedback",
      method: "POST",
      tenantId,
      body: {
        revieweeEmail: "ree@kit.test",
        cycleId: "cycle-q1",
        peerEmails: ["a@kit.test", "b@kit.test"],
      },
    });

    const res = await requestPeerFeedback(request, context);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.requested).toBe(2);
    expect(body.invitesAttempted).toBe(false);
    for (const r of body.reviewers) expect(r.invite).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    // The reviews should now exist in the repo with status=draft
    const all = await reviewRepository.list(tenantId, { limit: 10 });
    expect(all.items).toHaveLength(2);
    for (const r of all.items) {
      expect(r.status).toBe("draft");
      expect(r.kind).toBe("peer");
      expect(r.cycleId).toBe("cycle-q1");
    }
  });

  it("sends Resend emails when sendInvites is true", async () => {
    (environment as Record<string, string | undefined>).RESEND_API_KEY = "re_test_key";
    (environment as Record<string, string | undefined>).RESEND_FROM_EMAIL = "hr@kit.test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        new Response(JSON.stringify({ id: "msg_resend_1" }), { status: 200 }),
      );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/request-peer-feedback",
      method: "POST",
      tenantId,
      body: {
        revieweeEmail: "ree@kit.test",
        cycleId: "cycle-q1",
        peerEmails: ["a@kit.test", "b@kit.test"],
        sendInvites: true,
        revieweeName: "Renee",
        deadline: "Jan 19",
        reviewLink: "https://reviews.kit.test/a/b",
      },
    });

    const res = await requestPeerFeedback(request, context);
    const body = await res.json();
    expect(body.requested).toBe(2);
    expect(body.invitesAttempted).toBe(true);
    for (const r of body.reviewers) {
      expect(r.invite.sent).toBe(true);
      expect(r.invite.id).toBe("msg_resend_1");
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Each call should have the right template substitution.
    for (const call of fetchSpy.mock.calls) {
      const init = call[1] as RequestInit;
      const sentBody = JSON.parse(init.body as string);
      expect(sentBody.subject).toContain("Renee");
      expect(sentBody.text).toContain("Renee");
      expect(sentBody.text).toContain("Jan 19");
      expect(sentBody.text).toContain("https://reviews.kit.test/a/b");
    }
  });

  it("does NOT call Resend when sendInvites is false (drafts-only path)", async () => {
    (environment as Record<string, string | undefined>).RESEND_API_KEY = "re_test_key";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/request-peer-feedback",
      method: "POST",
      tenantId,
      body: {
        revieweeEmail: "ree@kit.test",
        cycleId: "cycle-q1",
        peerEmails: ["a@kit.test"],
        sendInvites: false,
      },
    });

    await requestPeerFeedback(request, context);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("captures Resend failure on the response without throwing", async () => {
    (environment as Record<string, string | undefined>).RESEND_API_KEY = "re_test_key";
    (environment as Record<string, string | undefined>).RESEND_FROM_EMAIL = "hr@kit.test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Forbidden", { status: 403 }),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/request-peer-feedback",
      method: "POST",
      tenantId,
      body: {
        revieweeEmail: "ree@kit.test",
        cycleId: "cycle-q1",
        peerEmails: ["a@kit.test"],
        sendInvites: true,
      },
    });

    const res = await requestPeerFeedback(request, context);
    const body = await res.json();
    expect(body.reviewers[0].invite.sent).toBe(false);
    expect(body.reviewers[0].invite.error).toContain("403");
  });

  it("skips peers that match the reviewee (can't peer-review yourself)", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/request-peer-feedback",
      method: "POST",
      tenantId,
      body: {
        revieweeEmail: "ree@kit.test",
        cycleId: "cycle-q1",
        peerEmails: ["a@kit.test", "ree@kit.test"],
      },
    });
    const res = await requestPeerFeedback(request, context);
    const body = await res.json();
    expect(body.requested).toBe(1);
  });

  it("returns 400 when peerEmails is empty", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/request-peer-feedback",
      method: "POST",
      tenantId,
      body: {
        revieweeEmail: "ree@kit.test",
        cycleId: "cycle-q1",
        peerEmails: [],
      },
    });
    const res = await requestPeerFeedback(request, context);
    expect(res.status).toBe(400);
  });

  it("isolates tenants — reviews are created only in the requesting tenant", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/request-peer-feedback",
      method: "POST",
      tenantId,
      body: {
        revieweeEmail: "ree@kit.test",
        cycleId: "cycle-q1",
        peerEmails: ["a@kit.test"],
      },
    });
    await requestPeerFeedback(request, context);

    const inTenant = await reviewRepository.list(tenantId, { limit: 10 });
    const elsewhere = await reviewRepository.list("other-tenant", { limit: 10 });
    expect(inTenant.items).toHaveLength(1);
    expect(elsewhere.items).toHaveLength(0);
  });
});

describe("orchestrator: track_goal_progress", () => {
  const tenantId = "tenant-goals";

  beforeEach(async () => {
    await wipeRepos(tenantId);
    await wipeRepos("other-tenant");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await wipeRepos(tenantId);
    await wipeRepos("other-tenant");
  });

  it("computes status counts, average progress, and overdue count", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await seedGoal(tenantId, {
      employeeEmail: "emp@kit.test",
      progress: 60,
      status: "on_track",
      dueDate: "2099-12-31",
    });
    await seedGoal(tenantId, {
      employeeEmail: "emp@kit.test",
      progress: 30,
      status: "at_risk",
      dueDate: "2099-12-31",
    });
    await seedGoal(tenantId, {
      employeeEmail: "emp@kit.test",
      progress: 100,
      status: "completed",
      dueDate: "2026-03-31",
    });
    // Overdue (not completed, dueDate in past)
    await seedGoal(tenantId, {
      employeeEmail: "emp@kit.test",
      progress: 20,
      status: "at_risk",
      dueDate: "2020-01-01",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/track-goal-progress",
      method: "POST",
      tenantId,
      body: { employeeEmail: "emp@kit.test" },
    });

    const res = await trackGoalProgress(request, context);
    const body = await res.json();
    expect(body.totalGoals).toBe(4);
    expect(body.countByStatus.on_track).toBe(1);
    expect(body.countByStatus.at_risk).toBe(2);
    expect(body.countByStatus.completed).toBe(1);
    expect(body.atRiskCount).toBe(2);
    expect(body.overdueCount).toBe(1);
    expect(body.avgProgress).toBe(52.5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns zero values when no goals exist (no-op)", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/track-goal-progress",
      method: "POST",
      tenantId,
      body: { employeeEmail: "emp@kit.test" },
    });

    const res = await trackGoalProgress(request, context);
    const body = await res.json();
    expect(body.totalGoals).toBe(0);
    expect(body.avgProgress).toBe(0);
    expect(body.onTrackPct).toBe(0);
  });

  it("isolates tenants", async () => {
    await seedGoal(tenantId, { employeeEmail: "emp@kit.test", progress: 50 });
    await seedGoal("other-tenant", {
      employeeEmail: "emp@kit.test",
      progress: 99,
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/track-goal-progress",
      method: "POST",
      tenantId,
      body: { employeeEmail: "emp@kit.test" },
    });

    const res = await trackGoalProgress(request, context);
    const body = await res.json();
    expect(body.totalGoals).toBe(1);
  });

  it("returns 400 when employeeEmail is missing", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/track-goal-progress",
      method: "POST",
      tenantId,
      body: {},
    });
    const res = await trackGoalProgress(request, context);
    expect(res.status).toBe(400);
  });
});

describe("orchestrator: summarize_feedback_themes", () => {
  let snap: Record<string, string | undefined>;
  const tenantId = "tenant-themes";

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

  it("computes aggregates without calling Claude when clusterThemes is false", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await seedReview(tenantId, {
      revieweeEmail: "ree@kit.test",
      cycleId: "cycle-q1",
      kind: "peer",
      status: "submitted",
      ratings: { problemSolving: 4 },
      narrative: "Great problem solver",
    });
    await seedReview(tenantId, {
      revieweeEmail: "ree@kit.test",
      cycleId: "cycle-q1",
      kind: "manager",
      status: "submitted",
      ratings: { problemSolving: 5 },
      narrative: "Strong leader",
    });
    // Excluded (different cycle)
    await seedReview(tenantId, {
      revieweeEmail: "ree@kit.test",
      cycleId: "cycle-q2",
      kind: "peer",
      status: "submitted",
      ratings: { problemSolving: 1 },
      narrative: "(should be filtered)",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/summarize-feedback-themes",
      method: "POST",
      tenantId,
      body: { revieweeEmail: "ree@kit.test", cycleId: "cycle-q1" },
    });

    const res = await summarizeFeedbackThemes(request, context);
    const body = await res.json();
    expect(body.reviewCount).toBe(2);
    expect(body.byKind.peer).toBe(1);
    expect(body.byKind.manager).toBe(1);
    expect(body.avgRatingsByCompetency.problemSolving).toBe(4.5);
    expect(body.themes).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls Claude to cluster themes when clusterThemes is true", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeClaude("### Theme: Strong communicator\nSummary."));

    await seedReview(tenantId, {
      revieweeEmail: "ree@kit.test",
      cycleId: "cycle-q1",
      narrative: "Communicates clearly in standups",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/summarize-feedback-themes",
      method: "POST",
      tenantId,
      body: {
        revieweeEmail: "ree@kit.test",
        cycleId: "cycle-q1",
        clusterThemes: true,
        revieweeName: "Renee",
      },
    });

    const res = await summarizeFeedbackThemes(request, context);
    const body = await res.json();
    expect(body.themes.text).toContain("Theme");
    expect(body.themes.sourceCount).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
  });

  it("uses AI_GATEWAY_URL when configured", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    (environment as Record<string, string | undefined>).AI_GATEWAY_URL =
      "https://gw.example.com/p";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(fakeClaude("themes"));

    await seedReview(tenantId, { narrative: "Good work" });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/summarize-feedback-themes",
      method: "POST",
      tenantId,
      body: {
        revieweeEmail: "ree@kit.test",
        cycleId: "cycle-2026-q1",
        clusterThemes: true,
      },
    });

    await summarizeFeedbackThemes(request, context);
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://gw.example.com/p/v1/messages");
  });

  it("does not call Claude when there are no narratives (no-op)", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // Submitted review but blank narrative
    await seedReview(tenantId, { narrative: "" });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/summarize-feedback-themes",
      method: "POST",
      tenantId,
      body: {
        revieweeEmail: "ree@kit.test",
        cycleId: "cycle-2026-q1",
        clusterThemes: true,
      },
    });

    const res = await summarizeFeedbackThemes(request, context);
    const body = await res.json();
    expect(body.themes.text).toContain("No submitted narratives");
    expect(body.themes.sourceCount).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("captures Claude failure into themes.text without throwing", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await seedReview(tenantId, { narrative: "Some feedback" });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/summarize-feedback-themes",
      method: "POST",
      tenantId,
      body: {
        revieweeEmail: "ree@kit.test",
        cycleId: "cycle-2026-q1",
        clusterThemes: true,
      },
    });
    const res = await summarizeFeedbackThemes(request, context);
    const body = await res.json();
    expect(body.themes.text).toContain("theme clustering unavailable");
  });

  it("isolates tenants", async () => {
    await seedReview(tenantId, {
      revieweeEmail: "ree@kit.test",
      cycleId: "cycle-q1",
      narrative: "in-tenant",
    });
    await seedReview("other-tenant", {
      revieweeEmail: "ree@kit.test",
      cycleId: "cycle-q1",
      narrative: "leak",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/summarize-feedback-themes",
      method: "POST",
      tenantId,
      body: { revieweeEmail: "ree@kit.test", cycleId: "cycle-q1" },
    });

    const res = await summarizeFeedbackThemes(request, context);
    const body = await res.json();
    expect(body.reviewCount).toBe(1);
  });

  it("returns 400 when revieweeEmail or cycleId is missing", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/orchestrators/summarize-feedback-themes",
      method: "POST",
      tenantId,
      body: { revieweeEmail: "ree@kit.test" },
    });
    const res = await summarizeFeedbackThemes(request, context);
    expect(res.status).toBe(400);
  });
});
