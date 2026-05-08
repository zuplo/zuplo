import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import scoreLead from "../modules/mcp-tools/score-lead.ts";
import routeSubmissionToOwner from "../modules/mcp-tools/route-submission-to-owner.ts";
import flagSpamPattern from "../modules/mcp-tools/flag-spam-pattern.ts";
import getSubmission from "../modules/handlers/get-submission.ts";
import listSubmissions from "../modules/handlers/list-submissions.ts";
import setSubmissionOwner from "../modules/handlers/set-submission-owner.ts";
import {
  submissionRepository,
  type Submission,
} from "../modules/repositories/submissions.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

const routes = {
  "GET /submissions": listSubmissions,
  "GET /submissions/{id}": getSubmission,
  "PATCH /submissions/{id}/route": setSubmissionOwner,
};

async function clearSubmissions(tenantIds: string[] = ["tenant-a", "tenant-b"]) {
  for (const t of tenantIds) {
    const page = await submissionRepository.list(t, { limit: 200 });
    for (const s of page.items) await submissionRepository.delete(t, s.id);
  }
}

async function seedSubmission(
  tenantId: string,
  overrides: Partial<Omit<Submission, "id" | "tenantId">> = {},
): Promise<Submission> {
  return submissionRepository.create(tenantId, {
    formId: "form_1",
    payload: { email: "buyer@acme.com", company: "Acme", ...(overrides.payload ?? {}) },
    submitterEmail: overrides.submitterEmail ?? "buyer@acme.com",
    ip: null,
    userAgent: null,
    submittedAt: overrides.submittedAt ?? new Date().toISOString(),
    score: overrides.score ?? null,
    routedTo: overrides.routedTo ?? null,
    processed: overrides.processed ?? false,
    spam: overrides.spam ?? false,
    ...overrides,
  } as Omit<Submission, "id" | "tenantId">);
}

// ---------------------------------------------------------------------------
// score_lead
// ---------------------------------------------------------------------------

describe("orchestrators/score_lead", () => {
  beforeEach(async () => {
    await clearSubmissions();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("SLACK_WEBHOOK_URL");
    clearEnv("RESEND_API_KEY");
    clearEnv("RESEND_FROM_EMAIL");
    clearEnv("ANTHROPIC_API_KEY");
  });

  it("happy path: scores a business email lead and reports signals", async () => {
    const sub = await seedSubmission("tenant-a", {
      payload: {
        email: "ceo@acme.com",
        company: "Acme",
        title: "CEO",
        phone: "555-0100",
      },
      submitterEmail: "ceo@acme.com",
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/score-lead",
      method: "POST",
      body: { submissionId: sub.id },
      tenantId: "tenant-a",
    });

    const res = await scoreLead(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      score: number;
      signals: { name: string }[];
      sideEffects: { slack: string | null; email: string | null };
    };
    expect(json.score).toBeGreaterThan(50);
    const names = json.signals.map((s) => s.name);
    expect(names).toContain("business_email");
    expect(names).toContain("company_provided");
    expect(names).toContain("title_provided");
    expect(names).toContain("senior_title");
    expect(json.sideEffects.slack).toBeNull();
    expect(json.sideEffects.email).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dispatches Slack + Resend only when notifySlack/confirmEmail are true", async () => {
    setEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/x");
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "from@kit.test");
    const sub = await seedSubmission("tenant-a", {
      payload: { email: "ceo@acme.com", company: "Acme" },
      submitterEmail: "ceo@acme.com",
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const u = String(input);
        if (u.startsWith("https://hooks.slack.com/")) {
          return new Response("ok", { status: 200 });
        }
        if (u === "https://api.resend.com/emails") {
          return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
        }
        return new Response("unmocked: " + u, { status: 500 });
      });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/score-lead",
      method: "POST",
      body: {
        submissionId: sub.id,
        notifySlack: true,
        confirmEmail: true,
        formName: "Demo Request",
      },
      tenantId: "tenant-a",
    });

    const res = await scoreLead(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      sideEffects: { slack: string | null; email: string | null };
    };
    expect(json.sideEffects.slack).toBe("sent");
    expect(json.sideEffects.email).toBe("sent:email_1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("opt-in flag off (defaults): does NOT call Slack or Resend", async () => {
    setEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/x");
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "from@kit.test");

    const sub = await seedSubmission("tenant-a");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("nope", { status: 500 }));

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/score-lead",
      method: "POST",
      body: { submissionId: sub.id },
      tenantId: "tenant-a",
    });

    const res = await scoreLead(request, context);
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blends Claude score when useClaude=true", async () => {
    setEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    const sub = await seedSubmission("tenant-a");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: '{"score": 90, "intent": "high", "isSpam": false, "reasoning": "great fit"}',
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      ),
    );

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/score-lead",
      method: "POST",
      body: { submissionId: sub.id, useClaude: true },
      tenantId: "tenant-a",
    });

    const res = await scoreLead(request, context);
    const json = (await res.json()) as {
      claude: { score: number; intent: string; isSpam: boolean } | null;
      signals: { name: string }[];
    };
    expect(json.claude).not.toBeNull();
    expect(json.claude?.score).toBe(90);
    expect(json.signals.find((s) => s.name === "claude_grade")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.anthropic.com/v1/messages",
    );
  });

  it("multi-tenant isolation: tenant-a's score_lead cannot read tenant-b's submission", async () => {
    const subB = await seedSubmission("tenant-b");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/score-lead",
      method: "POST",
      body: { submissionId: subB.id },
      tenantId: "tenant-a",
    });

    // get-submission returns 404 for the wrong tenant; invokeJson should throw.
    await expect(scoreLead(request, context)).rejects.toThrow(
      /Internal route .* failed: 404/,
    );
  });
});

// ---------------------------------------------------------------------------
// route_submission_to_owner
// ---------------------------------------------------------------------------

describe("orchestrators/route_submission_to_owner", () => {
  beforeEach(async () => {
    await clearSubmissions();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: picks an owner deterministically and PATCHes the submission", async () => {
    const sub = await seedSubmission("tenant-a");
    const { context, invokeCalls } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/route-submission-to-owner",
      method: "POST",
      body: { submissionId: sub.id, owners: ["alice", "bob", "carol"] },
      tenantId: "tenant-a",
    });

    const res = await routeSubmissionToOwner(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { routedTo: string };
    expect(["alice", "bob", "carol"]).toContain(json.routedTo);
    // Invokes the GET (lookup) and the PATCH.
    const patchCalls = invokeCalls.filter((c) => c.method === "PATCH");
    expect(patchCalls.length).toBe(1);

    const updated = await submissionRepository.get("tenant-a", sub.id);
    expect(updated?.routedTo).toBe(json.routedTo);
  });

  it("falls back to ['unassigned'] when no owners are passed", async () => {
    const sub = await seedSubmission("tenant-a");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/route-submission-to-owner",
      method: "POST",
      body: { submissionId: sub.id },
      tenantId: "tenant-a",
    });

    const res = await routeSubmissionToOwner(request, context);
    const json = (await res.json()) as { routedTo: string };
    expect(json.routedTo).toBe("unassigned");
  });

  it("multi-tenant isolation: tenant-a route-submission cannot touch tenant-b's submission", async () => {
    const subB = await seedSubmission("tenant-b");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/route-submission-to-owner",
      method: "POST",
      body: { submissionId: subB.id, owners: ["alice"] },
      tenantId: "tenant-a",
    });
    await expect(
      routeSubmissionToOwner(request, context),
    ).rejects.toThrow(/Internal route .* failed: 404/);

    const stillUnrouted = await submissionRepository.get("tenant-b", subB.id);
    expect(stillUnrouted?.routedTo).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// flag_spam_pattern
// ---------------------------------------------------------------------------

describe("orchestrators/flag_spam_pattern", () => {
  beforeEach(async () => {
    await clearSubmissions();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path with substring: counts matches and proposes a flag rule", async () => {
    await seedSubmission("tenant-a", {
      payload: { email: "x@y.com", message: "Buy crypto coins now!" },
    });
    await seedSubmission("tenant-a", {
      payload: { email: "y@z.com", message: "another crypto pitch" },
    });
    await seedSubmission("tenant-a", {
      payload: { email: "real@acme.com", message: "Hi I'd like a demo" },
    });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/flag-spam-pattern",
      method: "POST",
      body: { substring: "crypto", lookbackHours: 24 },
      tenantId: "tenant-a",
    });
    const res = await flagSpamPattern(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      matchCount: number;
      proposedRule: { pattern: string; action: string } | null;
    };
    expect(json.matchCount).toBe(2);
    expect(json.proposedRule?.pattern).toBe("crypto");
    expect(json.proposedRule?.action).toBe("flag");
  });

  it("happy path without substring: derives a domain-block rule from spam-flagged submissions", async () => {
    for (let i = 0; i < 3; i++) {
      await seedSubmission("tenant-a", {
        spam: true,
        submitterEmail: `bot${i}@spam.example`,
        payload: { email: `bot${i}@spam.example` },
      });
    }
    await seedSubmission("tenant-a", {
      submitterEmail: "real@acme.com",
      payload: { email: "real@acme.com" },
    });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/flag-spam-pattern",
      method: "POST",
      body: { lookbackHours: 24 },
      tenantId: "tenant-a",
    });
    const res = await flagSpamPattern(request, context);
    const json = (await res.json()) as {
      matchCount: number;
      proposedRule: { pattern: string; action: string } | null;
    };
    expect(json.matchCount).toBe(3);
    expect(json.proposedRule?.action).toBe("block");
    expect(json.proposedRule?.pattern).toBe("@spam.example");
  });

  it("no-op: empty database — no rule proposed", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/flag-spam-pattern",
      method: "POST",
      body: { lookbackHours: 24 },
      tenantId: "tenant-a",
    });
    const res = await flagSpamPattern(request, context);
    const json = (await res.json()) as { proposedRule: unknown; matchCount: number };
    expect(json.proposedRule).toBeNull();
    expect(json.matchCount).toBe(0);
  });

  it("multi-tenant isolation: tenant-a's scan ignores tenant-b's submissions", async () => {
    await seedSubmission("tenant-b", {
      payload: { email: "x@y.com", message: "crypto crypto crypto" },
    });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/flag-spam-pattern",
      method: "POST",
      body: { substring: "crypto", lookbackHours: 24 },
      tenantId: "tenant-a",
    });
    const res = await flagSpamPattern(request, context);
    const json = (await res.json()) as { matchCount: number };
    expect(json.matchCount).toBe(0);
  });
});
