import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import clusterOpenResponses from "../modules/mcp-tools/cluster-open-responses.ts";
import compareCohorts from "../modules/mcp-tools/compare-cohorts.ts";
import flagDetractorForCsm from "../modules/mcp-tools/flag-detractor-for-csm.ts";
import sendSurvey from "../modules/handlers/send-survey.ts";
import listResponses from "../modules/handlers/list-responses.ts";
import getSurvey from "../modules/handlers/get-survey.ts";
import { responseRepository } from "../modules/repositories/responses.ts";
import { surveyRepository } from "../modules/repositories/surveys.ts";

const routes = {
  "GET /responses": listResponses,
  "GET /surveys/:id": getSurvey,
};

async function clearAll(tenantId: string) {
  for (const repo of [responseRepository, surveyRepository]) {
    let cursor: string | null | undefined = null;
    do {
      const page = await repo.list(tenantId, { limit: 200, cursor });
      for (const item of page.items) {
        await repo.delete(tenantId, item.id);
      }
      cursor = page.nextCursor;
    } while (cursor);
  }
}

async function seedResponse(
  tenantId: string,
  surveyId: string,
  opts: Partial<{
    score: number;
    comment: string;
    category: "promoter" | "passive" | "detractor";
    respondedAt: string;
    segment: string;
    followedUp: boolean;
  }> = {},
) {
  return responseRepository.create(tenantId, {
    surveyId,
    customerEmail: "alice@x.com",
    score: opts.score ?? 5,
    comment: opts.comment ?? "n/a",
    category: opts.category ?? "detractor",
    respondedAt: opts.respondedAt ?? new Date().toISOString(),
    source: "email",
    segment: opts.segment ?? "smb",
    followedUp: opts.followedUp ?? false,
  });
}

describe("orchestrators/cluster-open-responses", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_GATEWAY_URL;
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });

  it("uses Claude clustering by default", async () => {
    const surveyId = "s-1";
    const r1 = await seedResponse(tenantId, surveyId, {
      comment: "Too expensive!",
    });
    const r2 = await seedResponse(tenantId, surveyId, {
      comment: "Slow loading times",
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg-x",
          model: "x",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                themes: [
                  {
                    theme: "pricing",
                    count: 1,
                    summary: "Customers complain about cost",
                    responseIds: [r1.id],
                  },
                  {
                    theme: "performance",
                    count: 1,
                    summary: "Slowness reports",
                    responseIds: [r2.id],
                  },
                ],
                unmatchedResponseIds: [],
              }),
            },
          ],
          stop_reason: "end_turn",
          usage: { input_tokens: 50, output_tokens: 100 },
        }),
        { status: 200 },
      ),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/cluster-open-responses",
      method: "POST",
      body: { surveyId },
      tenantId,
    });
    const response = await clusterOpenResponses(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      mode: string;
      topThemes: Array<{ theme: string; count: number; samples: unknown[] }>;
      totalResponses: number;
    };
    expect(json.mode).toBe("claude");
    expect(json.totalResponses).toBe(2);
    expect(json.topThemes).toHaveLength(2);
    expect(json.topThemes[0].theme).toBe("pricing");
    expect(json.topThemes[0].samples).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to keyword clustering when useClaude=false", async () => {
    const surveyId = "s-2";
    await seedResponse(tenantId, surveyId, {
      comment: "Way too expensive for what you get",
    });
    await seedResponse(tenantId, surveyId, {
      comment: "Slow as molasses, awful",
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/cluster-open-responses",
      method: "POST",
      body: { surveyId, useClaude: false },
      tenantId,
    });
    const response = await clusterOpenResponses(request, context);
    const json = (await response.json()) as {
      mode: string;
      topThemes: Array<{ theme: string; count: number }>;
    };
    expect(json.mode).toBe("keyword");
    const pricing = json.topThemes.find((t) => t.theme === "pricing");
    const perf = json.topThemes.find((t) => t.theme === "performance");
    expect(pricing?.count).toBe(1);
    expect(perf?.count).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to keyword when Claude returns invalid JSON", async () => {
    const surveyId = "s-3";
    await seedResponse(tenantId, surveyId, {
      comment: "expensive",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg",
          model: "x",
          content: [{ type: "text", text: "Sorry, no JSON for you." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      ),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/cluster-open-responses",
      method: "POST",
      body: { surveyId },
      tenantId,
    });
    const response = await clusterOpenResponses(request, context);
    const json = (await response.json()) as { mode: string };
    expect(json.mode).toBe("keyword");
  });

  it("returns 0 themes when no responses (no-op)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/cluster-open-responses",
      method: "POST",
      body: { surveyId: "no-data", useClaude: true },
      tenantId,
    });
    const response = await clusterOpenResponses(request, context);
    const json = (await response.json()) as {
      totalResponses: number;
      mode: string;
    };
    expect(json.totalResponses).toBe(0);
    // With no responses, Claude path is skipped — falls through to keyword.
    expect(json.mode).toBe("keyword");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("isolates responses to caller's tenant", async () => {
    const surveyId = "s-leak";
    await seedResponse(tenantId, surveyId, {
      comment: "expensive",
    });
    // Tenant-b response with same surveyId — must not appear.
    await seedResponse("tenant-b", surveyId, {
      comment: "leak comment",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/cluster-open-responses",
      method: "POST",
      body: { surveyId, useClaude: false },
      tenantId,
    });
    const response = await clusterOpenResponses(request, context);
    const json = (await response.json()) as { totalResponses: number };
    expect(json.totalResponses).toBe(1);
  });
});

describe("orchestrators/compare-cohorts", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });
  afterEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });

  it("computes NPS per segment and a delta", async () => {
    const surveyId = "s-1";
    // Enterprise: 2 promoter, 0 detractor → NPS = 100
    await seedResponse(tenantId, surveyId, { score: 9, category: "promoter", segment: "enterprise" });
    await seedResponse(tenantId, surveyId, { score: 10, category: "promoter", segment: "enterprise" });
    // SMB: 1 promoter, 1 detractor, 0 passive → NPS = 0
    await seedResponse(tenantId, surveyId, { score: 9, category: "promoter", segment: "smb" });
    await seedResponse(tenantId, surveyId, { score: 3, category: "detractor", segment: "smb" });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/compare-cohorts",
      method: "POST",
      body: { surveyId, segmentA: "enterprise", segmentB: "smb" },
      tenantId,
    });
    const response = await compareCohorts(request, context);
    const json = (await response.json()) as {
      cohortA: { npsScore: number; count: number };
      cohortB: { npsScore: number; count: number };
      delta: number;
    };
    expect(json.cohortA.count).toBe(2);
    expect(json.cohortA.npsScore).toBe(100);
    expect(json.cohortB.npsScore).toBe(0);
    expect(json.delta).toBe(100);
  });

  it("returns 0 NPS for cohorts with no responses", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/compare-cohorts",
      method: "POST",
      body: { surveyId: "nope", segmentA: "x", segmentB: "y" },
      tenantId,
    });
    const response = await compareCohorts(request, context);
    const json = (await response.json()) as {
      cohortA: { count: number; npsScore: number };
      cohortB: { count: number; npsScore: number };
    };
    expect(json.cohortA.count).toBe(0);
    expect(json.cohortA.npsScore).toBe(0);
    expect(json.cohortB.count).toBe(0);
  });
});

describe("orchestrators/flag-detractor-for-csm", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_DEFAULT_CHANNEL;
    delete process.env.SLACK_WEBHOOK_URL;
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });

  it("returns recent unfollowed detractors and posts to Slack when configured", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_DEFAULT_CHANNEL = "C123";
    const surveyId = "s-1";
    await seedResponse(tenantId, surveyId, {
      score: 3,
      category: "detractor",
      followedUp: false,
      comment: "Awful",
    });
    // Already followed up — should be excluded.
    await seedResponse(tenantId, surveyId, {
      score: 0,
      category: "detractor",
      followedUp: true,
      comment: "y",
    });
    // Not detractor (will be filtered server-side via category=detractor
    // and via category check on response object).
    await seedResponse(tenantId, surveyId, {
      score: 9,
      category: "promoter",
      comment: "love it",
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ts: "1.0" }), { status: 200 }),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/flag-detractor-for-csm",
      method: "POST",
      body: { postToSlack: true },
      tenantId,
    });
    const response = await flagDetractorForCsm(request, context);
    const json = (await response.json()) as {
      detractorCount: number;
      slack?: { ok: boolean };
    };
    expect(json.detractorCount).toBe(1);
    expect(json.slack?.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT call Slack when postToSlack is false", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_DEFAULT_CHANNEL = "C123";
    await seedResponse(tenantId, "s-1", {
      score: 0,
      category: "detractor",
      followedUp: false,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/flag-detractor-for-csm",
      method: "POST",
      body: { postToSlack: false },
      tenantId,
    });
    const response = await flagDetractorForCsm(request, context);
    const json = (await response.json()) as {
      detractorCount: number;
      slack?: unknown;
    };
    expect(json.detractorCount).toBe(1);
    expect(json.slack).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT call Slack when no detractors found", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_DEFAULT_CHANNEL = "C123";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/flag-detractor-for-csm",
      method: "POST",
      body: { postToSlack: true },
      tenantId,
    });
    const response = await flagDetractorForCsm(request, context);
    const json = (await response.json()) as {
      detractorCount: number;
      slack?: unknown;
    };
    expect(json.detractorCount).toBe(0);
    expect(json.slack).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("filters by segment", async () => {
    await seedResponse(tenantId, "s-1", {
      score: 0,
      category: "detractor",
      segment: "enterprise",
      followedUp: false,
    });
    await seedResponse(tenantId, "s-1", {
      score: 0,
      category: "detractor",
      segment: "smb",
      followedUp: false,
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/flag-detractor-for-csm",
      method: "POST",
      body: { segment: "enterprise" },
      tenantId,
    });
    const response = await flagDetractorForCsm(request, context);
    const json = (await response.json()) as {
      detractorCount: number;
      detractors: Array<{ segment: string }>;
    };
    expect(json.detractorCount).toBe(1);
    expect(json.detractors[0].segment).toBe("enterprise");
  });

  it("isolates results to caller's tenant", async () => {
    await seedResponse(tenantId, "s-1", {
      score: 0,
      category: "detractor",
      followedUp: false,
    });
    await seedResponse("tenant-b", "s-1", {
      score: 0,
      category: "detractor",
      followedUp: false,
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/flag-detractor-for-csm",
      method: "POST",
      body: {},
      tenantId,
    });
    const response = await flagDetractorForCsm(request, context);
    const json = (await response.json()) as { detractorCount: number };
    expect(json.detractorCount).toBe(1);
  });
});

describe("handlers/send-survey (Resend + Twilio fan-out)", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "surveys@example.com";
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_FROM_NUMBER = "+15551234567";
    await clearAll(tenantId);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    await clearAll(tenantId);
  });

  it("sends to email + SMS recipients in one call", async () => {
    const survey = await surveyRepository.create(tenantId, {
      name: "Q1 NPS",
      kind: "nps",
      question: "How likely are you to recommend us?",
      sendCadence: "manual",
      status: "active",
    });

    let resendCalls = 0;
    let twilioCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://api.resend.com/emails") {
        resendCalls += 1;
        return new Response(JSON.stringify({ id: `re_${resendCalls}` }), {
          status: 200,
        });
      }
      if (url.includes("twilio.com")) {
        twilioCalls += 1;
        return new Response(
          JSON.stringify({
            sid: `SM_${twilioCalls}`,
            status: "queued",
            to: "+1",
            from: "+15551234567",
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: `https://kit.test/surveys/${survey.id}/send`,
      method: "POST",
      body: {
        recipients: [
          { channel: "email", to: "alice@x.com" },
          { channel: "sms", to: "+15559999999" },
          "bob@y.com", // legacy bare string → email
        ],
        surveyUrl: "https://example.com/s/1",
      },
      params: { id: survey.id },
      tenantId,
    });
    const response = await sendSurvey(request, context);
    expect(response.status).toBe(202);
    const json = (await response.json()) as {
      queued: number;
      sent: number;
      results: Array<{ channel: string; ok: boolean }>;
    };
    expect(json.queued).toBe(3);
    expect(json.sent).toBe(3);
    expect(json.results.filter((r) => r.channel === "email")).toHaveLength(2);
    expect(json.results.filter((r) => r.channel === "sms")).toHaveLength(1);
    expect(resendCalls).toBe(2);
    expect(twilioCalls).toBe(1);
  });

  it("returns 409 when survey is paused", async () => {
    const survey = await surveyRepository.create(tenantId, {
      name: "Paused",
      kind: "nps",
      question: "?",
      sendCadence: "manual",
      status: "paused",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: `https://kit.test/surveys/${survey.id}/send`,
      method: "POST",
      body: { recipients: ["alice@x.com"] },
      params: { id: survey.id },
      tenantId,
    });
    const response = await sendSurvey(request, context);
    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("captures per-recipient failures without aborting the whole call", async () => {
    const survey = await surveyRepository.create(tenantId, {
      name: "x",
      kind: "nps",
      question: "?",
      sendCadence: "manual",
      status: "active",
    });
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
      }
      return new Response("err", { status: 500 });
    });
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: `https://kit.test/surveys/${survey.id}/send`,
      method: "POST",
      body: {
        recipients: [
          { channel: "email", to: "a@x.com" },
          { channel: "email", to: "b@x.com" },
        ],
      },
      params: { id: survey.id },
      tenantId,
    });
    const response = await sendSurvey(request, context);
    expect(response.status).toBe(202);
    const json = (await response.json()) as {
      sent: number;
      results: Array<{ ok: boolean; error?: string }>;
    };
    expect(json.sent).toBe(1);
    expect(json.results[0].ok).toBe(true);
    expect(json.results[1].ok).toBe(false);
    expect(json.results[1].error).toContain("Resend send failed");
  });
});
