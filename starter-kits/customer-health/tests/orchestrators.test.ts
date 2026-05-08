import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import predictChurnRisk from "../modules/mcp-tools/predict-churn-risk.ts";
import recommendPlaybook from "../modules/mcp-tools/recommend-playbook.ts";
import summarizeAccountHealth from "../modules/mcp-tools/summarize-account-health.ts";
import listAccounts from "../modules/handlers/list-accounts.ts";
import getAccount from "../modules/handlers/get-account.ts";
import listHealthScores from "../modules/handlers/list-health-scores.ts";
import listSignals from "../modules/handlers/list-signals.ts";
import listPlaybooks from "../modules/handlers/list-playbooks.ts";
import listPlaybookRuns from "../modules/handlers/list-playbook-runs.ts";
import { accountRepository } from "../modules/repositories/accounts.ts";
import { healthScoreRepository } from "../modules/repositories/health-scores.ts";
import { signalRepository } from "../modules/repositories/signals.ts";
import { playbookRepository } from "../modules/repositories/playbooks.ts";
import { playbookRunRepository } from "../modules/repositories/playbook-runs.ts";

const routes = {
  "GET /accounts": listAccounts,
  "GET /accounts/:id": getAccount,
  "GET /health-scores": listHealthScores,
  "GET /signals": listSignals,
  "GET /playbooks": listPlaybooks,
  "GET /playbook-runs": listPlaybookRuns,
};

async function clearAll(tenantId: string) {
  for (const repo of [
    accountRepository,
    healthScoreRepository,
    signalRepository,
    playbookRepository,
    playbookRunRepository,
  ]) {
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

async function seedAccount(
  tenantId: string,
  opts: Partial<{
    name: string;
    csmEmail: string;
    arrCents: number;
    renewsAt: string;
    segment: "smb" | "midmarket" | "enterprise";
  }> = {},
) {
  return accountRepository.create(tenantId, {
    name: opts.name ?? "Acme",
    csmEmail: opts.csmEmail ?? "csm@example.com",
    arrCents: opts.arrCents ?? 1_000_000,
    renewsAt: opts.renewsAt ?? "2099-12-31",
    segment: opts.segment ?? "midmarket",
    lifecycleStage: "live",
  });
}

describe("orchestrators/predict-churn-risk", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.POSTHOG_PERSONAL_API_KEY;
    delete process.env.POSTHOG_PROJECT_ID;
    delete process.env.AI_GATEWAY_URL;
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });

  it("classifies at-risk accounts using Claude when classifyWithClaude not opted out", async () => {
    const account = await seedAccount(tenantId, {
      name: "Acme",
      renewsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    await healthScoreRepository.create(tenantId, {
      accountId: account.id,
      scoreValue: 30,
      computedAt: new Date().toISOString(),
      tier: "red",
      drivers: [],
    });
    await signalRepository.create(tenantId, {
      accountId: account.id,
      kind: "usage_drop",
      severity: "high",
      detectedAt: new Date().toISOString(),
      value: 50,
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg-x",
          model: "x",
          content: [
            {
              type: "text",
              text: `[{"accountId":"${account.id}","risk":"high","reasoning":"Red tier and high signal at renewal"}]`,
            },
          ],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 30 },
        }),
        { status: 200 },
      ),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/predict-churn-risk",
      method: "POST",
      body: {},
      tenantId,
    });
    const response = await predictChurnRisk(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      atRiskCount: number;
      atRisk: Array<{
        account: { id: string };
        claudeRisk: string | null;
        claudeReasoning: string | null;
        reasons: string[];
      }>;
    };
    expect(json.atRiskCount).toBe(1);
    expect(json.atRisk[0].account.id).toBe(account.id);
    expect(json.atRisk[0].claudeRisk).toBe("high");
    expect(json.atRisk[0].claudeReasoning).toContain("Red tier");
    expect(json.atRisk[0].reasons.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.anthropic.com/v1/messages",
    );
  });

  it("does not call Claude when classifyWithClaude=false", async () => {
    const account = await seedAccount(tenantId, {
      renewsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    await healthScoreRepository.create(tenantId, {
      accountId: account.id,
      scoreValue: 30,
      computedAt: new Date().toISOString(),
      tier: "red",
      drivers: [],
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/predict-churn-risk",
      method: "POST",
      body: { classifyWithClaude: false },
      tenantId,
    });
    const response = await predictChurnRisk(request, context);
    const json = (await response.json()) as {
      atRiskCount: number;
      atRisk: Array<{ claudeRisk: unknown }>;
    };
    expect(json.atRiskCount).toBe(1);
    expect(json.atRisk[0].claudeRisk).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns empty atRisk when no risky accounts (no-op)", async () => {
    await seedAccount(tenantId, {
      renewsAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/predict-churn-risk",
      method: "POST",
      body: {},
      tenantId,
    });
    const response = await predictChurnRisk(request, context);
    const json = (await response.json()) as { atRiskCount: number; atRisk: unknown[] };
    expect(json.atRiskCount).toBe(0);
    expect(json.atRisk).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("filters by csmEmail", async () => {
    const aliceAccount = await seedAccount(tenantId, {
      csmEmail: "alice@team.com",
      renewsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    await healthScoreRepository.create(tenantId, {
      accountId: aliceAccount.id,
      scoreValue: 30,
      computedAt: new Date().toISOString(),
      tier: "red",
      drivers: [],
    });
    const bobAccount = await seedAccount(tenantId, {
      csmEmail: "bob@team.com",
      renewsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    await healthScoreRepository.create(tenantId, {
      accountId: bobAccount.id,
      scoreValue: 30,
      computedAt: new Date().toISOString(),
      tier: "red",
      drivers: [],
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/predict-churn-risk",
      method: "POST",
      body: { csmEmail: "alice@team.com", classifyWithClaude: false },
      tenantId,
    });
    const response = await predictChurnRisk(request, context);
    const json = (await response.json()) as {
      atRiskCount: number;
      atRisk: Array<{ account: { id: string } }>;
    };
    expect(json.atRiskCount).toBe(1);
    expect(json.atRisk[0].account.id).toBe(aliceAccount.id);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses AI_GATEWAY_URL when configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.AI_GATEWAY_URL = "https://gw.example.zuplo.app";
    const account = await seedAccount(tenantId, {
      renewsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    await healthScoreRepository.create(tenantId, {
      accountId: account.id,
      scoreValue: 30,
      computedAt: new Date().toISOString(),
      tier: "red",
      drivers: [],
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg-g",
          model: "x",
          content: [{ type: "text", text: "[]" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      ),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/predict-churn-risk",
      method: "POST",
      body: {},
      tenantId,
    });
    await predictChurnRisk(request, context);
    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://gw.example.zuplo.app/v1/messages",
    );
  });

  it("isolates accounts to caller's tenant", async () => {
    const aAccount = await seedAccount(tenantId, {
      renewsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    await healthScoreRepository.create(tenantId, {
      accountId: aAccount.id,
      scoreValue: 30,
      computedAt: new Date().toISOString(),
      tier: "red",
      drivers: [],
    });
    const bAccount = await seedAccount("tenant-b", {
      name: "Other",
      renewsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    await healthScoreRepository.create("tenant-b", {
      accountId: bAccount.id,
      scoreValue: 30,
      computedAt: new Date().toISOString(),
      tier: "red",
      drivers: [],
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/predict-churn-risk",
      method: "POST",
      body: { classifyWithClaude: false },
      tenantId,
    });
    const response = await predictChurnRisk(request, context);
    const json = (await response.json()) as {
      atRiskCount: number;
      atRisk: Array<{ account: { id: string } }>;
    };
    expect(json.atRiskCount).toBe(1);
    expect(json.atRisk[0].account.id).toBe(aAccount.id);
  });

  it("gracefully handles Claude returning non-JSON (warn but no crash)", async () => {
    const account = await seedAccount(tenantId, {
      renewsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    await healthScoreRepository.create(tenantId, {
      accountId: account.id,
      scoreValue: 30,
      computedAt: new Date().toISOString(),
      tier: "red",
      drivers: [],
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg",
          model: "x",
          content: [{ type: "text", text: "I am sorry, no JSON for you." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      ),
    );
    const { context, logs } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/predict-churn-risk",
      method: "POST",
      body: {},
      tenantId,
    });
    const response = await predictChurnRisk(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      atRisk: Array<{ claudeRisk: unknown }>;
    };
    expect(json.atRisk[0].claudeRisk).toBeNull();
    expect(
      logs.some(
        (l) =>
          l.level === "warn" &&
          l.messages.some((m) => String(m).includes("non-JSON")),
      ),
    ).toBe(true);
  });
});

describe("orchestrators/recommend-playbook", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });
  afterEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });

  it("recommends matching playbook based on signal severity", async () => {
    const account = await seedAccount(tenantId);
    await signalRepository.create(tenantId, {
      accountId: account.id,
      kind: "usage_drop",
      severity: "high",
      detectedAt: new Date().toISOString(),
      value: 80,
    });
    const playbook = await playbookRepository.create(tenantId, {
      name: "Usage Drop Recovery",
      trigger: { signalKind: "usage_drop", minSeverity: "med" },
      steps: ["call CSM"],
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/recommend-playbook",
      method: "POST",
      body: { accountId: account.id },
      tenantId,
    });
    const response = await recommendPlaybook(request, context);
    const json = (await response.json()) as {
      topRecommendation: { playbook: { id: string } } | null;
      candidates: Array<{ playbook: { id: string } }>;
    };
    expect(json.topRecommendation?.playbook.id).toBe(playbook.id);
    expect(json.candidates).toHaveLength(1);
  });

  it("excludes playbooks already running on the account", async () => {
    const account = await seedAccount(tenantId);
    await signalRepository.create(tenantId, {
      accountId: account.id,
      kind: "usage_drop",
      severity: "high",
      detectedAt: new Date().toISOString(),
      value: 80,
    });
    const playbook = await playbookRepository.create(tenantId, {
      name: "Recovery",
      trigger: { signalKind: "usage_drop", minSeverity: "low" },
      steps: ["x"],
    });
    await playbookRunRepository.create(tenantId, {
      playbookId: playbook.id,
      accountId: account.id,
      status: "active",
      currentStep: 0,
      startedAt: new Date().toISOString(),
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/recommend-playbook",
      method: "POST",
      body: { accountId: account.id },
      tenantId,
    });
    const response = await recommendPlaybook(request, context);
    const json = (await response.json()) as {
      topRecommendation: unknown;
      candidates: unknown[];
    };
    expect(json.topRecommendation).toBeNull();
    expect(json.candidates).toEqual([]);
  });

  it("returns empty candidates when no signals (no-op)", async () => {
    const account = await seedAccount(tenantId);
    await playbookRepository.create(tenantId, {
      name: "Recovery",
      trigger: { signalKind: "usage_drop", minSeverity: "low" },
      steps: [],
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/recommend-playbook",
      method: "POST",
      body: { accountId: account.id },
      tenantId,
    });
    const response = await recommendPlaybook(request, context);
    const json = (await response.json()) as {
      topRecommendation: unknown;
      candidates: unknown[];
    };
    expect(json.topRecommendation).toBeNull();
    expect(json.candidates).toEqual([]);
  });

  it("isolates playbooks/signals to caller's tenant", async () => {
    const account = await seedAccount(tenantId);
    await signalRepository.create(tenantId, {
      accountId: account.id,
      kind: "usage_drop",
      severity: "high",
      detectedAt: new Date().toISOString(),
      value: 80,
    });
    // Tenant-b playbook should not match.
    await playbookRepository.create("tenant-b", {
      name: "Wrong tenant",
      trigger: { signalKind: "usage_drop", minSeverity: "low" },
      steps: [],
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/recommend-playbook",
      method: "POST",
      body: { accountId: account.id },
      tenantId,
    });
    const response = await recommendPlaybook(request, context);
    const json = (await response.json()) as {
      candidates: unknown[];
      topRecommendation: unknown;
    };
    expect(json.candidates).toEqual([]);
    expect(json.topRecommendation).toBeNull();
  });
});

describe("orchestrators/summarize-account-health", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
  });
  afterEach(async () => {
    await clearAll(tenantId);
  });

  it("returns the latest score, ordered signals, runs, and a narrative", async () => {
    const account = await seedAccount(tenantId, {
      name: "Acme",
      renewsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    await healthScoreRepository.create(tenantId, {
      accountId: account.id,
      scoreValue: 70,
      computedAt: new Date().toISOString(),
      tier: "yellow",
      drivers: [],
    });
    await signalRepository.create(tenantId, {
      accountId: account.id,
      kind: "ticket_spike",
      severity: "high",
      detectedAt: new Date().toISOString(),
      value: 5,
    });
    await signalRepository.create(tenantId, {
      accountId: account.id,
      kind: "usage_drop",
      severity: "low",
      detectedAt: new Date().toISOString(),
      value: 10,
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/summarize-account-health",
      method: "POST",
      body: { accountId: account.id },
      tenantId,
    });
    const response = await summarizeAccountHealth(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      tier: string;
      openSignals: Array<{ severity: string }>;
      narrative: string;
    };
    expect(json.tier).toBe("yellow");
    expect(json.openSignals[0].severity).toBe("high");
    expect(json.narrative).toContain("Acme");
  });

  it("handles account with no score / no signals / no runs", async () => {
    const account = await seedAccount(tenantId, { name: "Bare" });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/summarize-account-health",
      method: "POST",
      body: { accountId: account.id },
      tenantId,
    });
    const response = await summarizeAccountHealth(request, context);
    const json = (await response.json()) as {
      tier: string | null;
      openSignals: unknown[];
      activeRuns: unknown[];
      narrative: string;
    };
    expect(json.tier).toBeNull();
    expect(json.openSignals).toEqual([]);
    expect(json.activeRuns).toEqual([]);
    expect(json.narrative).toContain("Bare");
  });
});
