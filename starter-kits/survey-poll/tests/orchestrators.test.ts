import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import sendSurvey from "../modules/mcp-tools/send-survey.ts";
import clusterOpenResponses from "../modules/mcp-tools/cluster-open-responses.ts";
import proposeFollowupQuestion from "../modules/mcp-tools/propose-followup-question.ts";
import getSurvey from "../modules/handlers/get-survey.ts";
import listQuestions from "../modules/handlers/list-questions.ts";
import listResponses from "../modules/handlers/list-responses.ts";
import getResponse from "../modules/handlers/get-response.ts";
import submitResponse from "../modules/handlers/submit-response.ts";
import {
  surveyRepository,
  questionRepository,
  responseRepository,
  answerRepository,
  type Survey,
  type Question,
  type Response_,
  type Answer,
} from "../modules/repositories/surveys.ts";
import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";

const env = environment as Record<string, string | undefined>;

function setEnv(key: string, value: string) {
  env[key] = value;
}
function clearEnv(...keys: string[]) {
  for (const k of keys) delete env[k];
}

const routes = {
  "GET /surveys/:id": (req: ZuploRequest, ctx: ZuploContext) => getSurvey(req, ctx),
  "GET /surveys/:id/questions": (req: ZuploRequest, ctx: ZuploContext) => listQuestions(req, ctx),
  "GET /surveys/:id/responses": (req: ZuploRequest, ctx: ZuploContext) => listResponses(req, ctx),
  "GET /responses/:id": (req: ZuploRequest, ctx: ZuploContext) => getResponse(req, ctx),
};

async function seedSurvey(tenantId: string, overrides: Partial<Survey> = {}): Promise<Survey> {
  return surveyRepository.create(tenantId, {
    slug: `s-${Math.random().toString(36).slice(2, 8)}`,
    title: "Test survey",
    description: "Hi",
    kind: "survey",
    status: "open",
    openedAt: new Date().toISOString(),
    closesAt: null,
    anonymous: false,
    audienceSlug: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  });
}

async function seedQuestion(
  tenantId: string,
  surveyId: string,
  overrides: Partial<Question> = {},
): Promise<Question> {
  return questionRepository.create(tenantId, {
    surveyId,
    prompt: "What did you think?",
    kind: "text",
    options: [],
    required: false,
    displayOrder: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  });
}

async function seedAnswer(
  tenantId: string,
  surveyId: string,
  questionId: string,
  value: unknown,
): Promise<{ response: Response_; answer: Answer }> {
  const response = await responseRepository.create(tenantId, {
    surveyId,
    respondentEmail: "x@y.com",
    submittedAt: new Date().toISOString(),
    anonymous: false,
    createdAt: new Date().toISOString(),
  });
  const answer = await answerRepository.create(tenantId, {
    responseId: response.id,
    questionId,
    value,
    createdAt: new Date().toISOString(),
  });
  return { response, answer };
}

describe("orchestrator: send_survey", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv(
      "RESEND_API_KEY",
      "RESEND_FROM_EMAIL",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_FROM_NUMBER",
    );
  });

  it("happy path: emails one Resend message per recipient", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    const tenantId = "tenant-send-1";
    const survey = await seedSurvey(tenantId);
    await seedQuestion(tenantId, survey.id);
    await seedQuestion(tenantId, survey.id, { displayOrder: 1 });

    // Use mockImplementation so each fetch call gets a fresh Response — the
    // body of a single Response can only be consumed once.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(JSON.stringify({ id: "re_msg" }), { status: 200 }),
      );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/send-survey",
      method: "POST",
      body: {
        surveyId: survey.id,
        channel: "email",
        respondUrl: "https://app.example.com/s/{name}",
        recipients: [
          { email: "alice@example.com", name: "Alice" },
          { email: "bob@example.com", name: "Bob" },
        ],
      },
      tenantId,
    });

    const response = await sendSurvey(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      attempted: number;
      delivered: number;
      reports: Array<{ to: string; ok: boolean; channel: string }>;
    };
    expect(json.attempted).toBe(2);
    expect(json.delivered).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(json.reports[0].channel).toBe("email");
  });

  it("texts via Twilio when channel=sms", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    setEnv("TWILIO_FROM_NUMBER", "+15550100");
    const tenantId = "tenant-send-sms";
    const survey = await seedSurvey(tenantId);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sid: "SMtest",
          status: "queued",
          to: "+15550199",
          from: "+15550100",
          body: "x",
          date_created: "x",
          num_segments: "1",
          price: null,
          error_code: null,
          error_message: null,
        }),
        { status: 201 },
      ),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/send-survey",
      method: "POST",
      body: {
        surveyId: survey.id,
        channel: "sms",
        respondUrl: "https://app.example.com/s",
        recipients: [{ phone: "+15550199", name: "Alice" }],
      },
      tenantId,
    });

    const response = await sendSurvey(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { delivered: number };
    expect(json.delivered).toBe(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.twilio.com");
  });

  it("returns 409 when survey is not open (draft state)", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    const tenantId = "tenant-send-draft";
    const survey = await seedSurvey(tenantId, { status: "draft" });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/send-survey",
      method: "POST",
      body: {
        surveyId: survey.id,
        channel: "email",
        respondUrl: "https://x.com",
        recipients: [{ email: "a@x.com" }],
      },
      tenantId,
    });

    const response = await sendSurvey(request, context);
    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports per-recipient failure when an integration call errors", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    const tenantId = "tenant-send-mixed";
    const survey = await seedSurvey(tenantId);

    let call = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      call++;
      if (call === 1) return new Response(JSON.stringify({ id: "ok" }), { status: 200 });
      return new Response("oops", { status: 500 });
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/send-survey",
      method: "POST",
      body: {
        surveyId: survey.id,
        channel: "email",
        respondUrl: "https://x.com",
        recipients: [
          { email: "ok@example.com" },
          { email: "fail@example.com" },
        ],
      },
      tenantId,
    });

    const response = await sendSurvey(request, context);
    const json = (await response.json()) as {
      delivered: number;
      failed: number;
      reports: Array<{ to: string; ok: boolean; error: string | null }>;
    };
    expect(json.delivered).toBe(1);
    expect(json.failed).toBe(1);
    const failed = json.reports.find((r) => !r.ok);
    expect(failed?.error).toMatch(/500/);
  });

  it("scopes to a single tenant — does not see another tenant's surveys", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    const tenantA = "tenant-send-iso-a";
    const tenantB = "tenant-send-iso-b";
    const surveyB = await seedSurvey(tenantB);

    // Tenant A tries to use B's survey id — should fail (404 from getSurvey).
    const { context } = makeContext({ routes, tenantId: tenantA });
    const request = makeRequest({
      url: "https://kit.test/send-survey",
      method: "POST",
      body: {
        surveyId: surveyB.id,
        channel: "email",
        respondUrl: "https://x.com",
        recipients: [{ email: "a@x.com" }],
      },
      tenantId: tenantA,
    });

    await expect(sendSurvey(request, context)).rejects.toThrow();
  });
});

describe("orchestrator: cluster_open_responses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("ANTHROPIC_API_KEY");
  });

  it("uses Claude for clustering when useClaude=true and the API succeeds", async () => {
    setEnv("ANTHROPIC_API_KEY", "sk-test");
    const tenantId = "tenant-cluster-1";
    const survey = await seedSurvey(tenantId);
    const q = await seedQuestion(tenantId, survey.id);
    await seedAnswer(tenantId, survey.id, q.id, "performance is slow");
    await seedAnswer(tenantId, survey.id, q.id, "performance issues again");
    await seedAnswer(tenantId, survey.id, q.id, "the UI is great");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                themes: [
                  {
                    name: "performance",
                    description: "slow",
                    count: 2,
                    sampleIndexes: [0, 1],
                  },
                ],
              }),
            },
          ],
          model: "claude-sonnet-4-5",
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
      body: { surveyId: survey.id, questionId: q.id },
      tenantId,
    });

    const response = await clusterOpenResponses(request, context);
    const json = (await response.json()) as {
      engine: string;
      themes: Array<{ keyword: string; count: number; samples: string[] }>;
    };
    expect(json.engine).toBe("claude");
    expect(json.themes[0].keyword).toBe("performance");
    expect(json.themes[0].count).toBe(2);
    expect(json.themes[0].samples).toContain("performance is slow");
  });

  it("falls back to keyword tokenization when useClaude=false (no Claude call)", async () => {
    const tenantId = "tenant-cluster-fallback";
    const survey = await seedSurvey(tenantId);
    const q = await seedQuestion(tenantId, survey.id);
    await seedAnswer(tenantId, survey.id, q.id, "performance is slow");
    await seedAnswer(tenantId, survey.id, q.id, "performance issue again");

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/cluster-open-responses",
      method: "POST",
      body: { surveyId: survey.id, questionId: q.id, useClaude: false },
      tenantId,
    });

    const response = await clusterOpenResponses(request, context);
    const json = (await response.json()) as {
      engine: string;
      themes: Array<{ keyword: string; count: number }>;
    };
    expect(json.engine).toBe("fallback");
    expect(json.themes.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to keyword tokenization when Claude API errors", async () => {
    setEnv("ANTHROPIC_API_KEY", "sk-test");
    const tenantId = "tenant-cluster-err";
    const survey = await seedSurvey(tenantId);
    const q = await seedQuestion(tenantId, survey.id);
    await seedAnswer(tenantId, survey.id, q.id, "performance issues");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/cluster-open-responses",
      method: "POST",
      body: { surveyId: survey.id, questionId: q.id },
      tenantId,
    });

    const response = await clusterOpenResponses(request, context);
    const json = (await response.json()) as {
      engine: string;
      engineError: string | null;
    };
    expect(json.engine).toBe("fallback");
    expect(json.engineError).toMatch(/429/);
  });

  it("returns empty themes when no responses exist (no Claude call)", async () => {
    const tenantId = "tenant-cluster-empty";
    const survey = await seedSurvey(tenantId);
    const q = await seedQuestion(tenantId, survey.id);

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/cluster-open-responses",
      method: "POST",
      body: { surveyId: survey.id, questionId: q.id },
      tenantId,
    });

    const response = await clusterOpenResponses(request, context);
    const json = (await response.json()) as { themes: unknown[] };
    expect(json.themes).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("orchestrator: propose_followup_question", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a heuristic prompt for the chosen kind without calling any integration", async () => {
    const tenantId = "tenant-propose-1";
    const survey = await seedSurvey(tenantId, { title: "Q1 NPS" });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/propose-followup-question",
      method: "POST",
      body: {
        surveyId: survey.id,
        themeKeywords: ["performance", "reliability"],
        kind: "single_choice",
      },
      tenantId,
    });

    const response = await proposeFollowupQuestion(request, context);
    const json = (await response.json()) as {
      proposedQuestion: { kind: string; options: string[]; prompt: string };
    };
    expect(json.proposedQuestion.kind).toBe("single_choice");
    expect(json.proposedQuestion.options).toEqual(["performance", "reliability"]);
    expect(json.proposedQuestion.prompt).toContain("performance");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("orchestrator-ish: submit_response (uses Slack for detractors)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("SLACK_WEBHOOK_URL", "SLACK_BOT_TOKEN");
  });

  it("posts to Slack when an NPS answer is in detractor range (0-6)", async () => {
    env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T/B/x";
    const tenantId = "tenant-detractor-1";
    const survey = await seedSurvey(tenantId);
    const npsQ = await seedQuestion(tenantId, survey.id, { kind: "nps" });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/responses",
      method: "POST",
      body: {
        surveyId: survey.id,
        respondentEmail: "angry@example.com",
        answers: [{ questionId: npsQ.id, value: 3 }],
      },
      tenantId,
    });

    const response = await submitResponse(request, context);
    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("hooks.slack.com");
  });

  it("does not call Slack when NPS score is in promoter range (9-10)", async () => {
    env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T/B/x";
    const tenantId = "tenant-detractor-2";
    const survey = await seedSurvey(tenantId);
    const npsQ = await seedQuestion(tenantId, survey.id, { kind: "nps" });

    const fetchMock = vi.spyOn(globalThis, "fetch");

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/responses",
      method: "POST",
      body: {
        surveyId: survey.id,
        respondentEmail: "happy@example.com",
        answers: [{ questionId: npsQ.id, value: 10 }],
      },
      tenantId,
    });

    const response = await submitResponse(request, context);
    expect(response.status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("silent=true skips Slack alert even when detractor", async () => {
    env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T/B/x";
    const tenantId = "tenant-detractor-silent";
    const survey = await seedSurvey(tenantId);
    const npsQ = await seedQuestion(tenantId, survey.id, { kind: "nps" });

    const fetchMock = vi.spyOn(globalThis, "fetch");

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/responses",
      method: "POST",
      body: {
        surveyId: survey.id,
        respondentEmail: "x@y.com",
        answers: [{ questionId: npsQ.id, value: 2 }],
        silent: true,
      },
      tenantId,
    });

    const response = await submitResponse(request, context);
    expect(response.status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
