import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import explainCommissionAmount from "../modules/mcp-tools/explain-commission-amount.ts";
import flagClawbackRisk from "../modules/mcp-tools/flag-clawback-risk.ts";
import modelWhatIfClose from "../modules/mcp-tools/model-what-if-close.ts";
import approvePayout from "../modules/handlers/approve-payout.ts";
import getPayout from "../modules/handlers/get-payout.ts";
import listPayouts from "../modules/handlers/list-payouts.ts";
import listCredits from "../modules/handlers/list-credits.ts";
import listPlans from "../modules/handlers/list-plans.ts";
import listQuotas from "../modules/handlers/list-quotas.ts";
import { payoutRepository } from "../modules/repositories/payouts.ts";
import { creditRepository } from "../modules/repositories/credits.ts";
import { compPlanRepository } from "../modules/repositories/comp-plans.ts";
import { quotaRepository } from "../modules/repositories/quotas.ts";

const routes = {
  "GET /payouts": listPayouts,
  "GET /payouts/:id": getPayout,
  "GET /credits": listCredits,
  "GET /plans": listPlans,
  "GET /quotas": listQuotas,
};

async function clearAll(tenantId: string) {
  for (const repo of [
    payoutRepository,
    creditRepository,
    compPlanRepository,
    quotaRepository,
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

describe("orchestrators/explain-commission-amount", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });

  it("returns structured math + Claude explanation by default", async () => {
    const period = "2026-Q1";
    const plan = await compPlanRepository.create(tenantId, {
      name: "Q1 Plan",
      baseRate: 0.1,
      accelerators: [{ threshold: 100, rate: 0.15 }],
      period,
    });
    await creditRepository.create(tenantId, {
      repEmail: "alice@team.com",
      dealId: "d-1",
      amountCents: 100_000,
      period,
      splitPercent: 100,
      creditedAt: new Date().toISOString(),
      dealStatus: "closed_won",
    });
    const payout = await payoutRepository.create(tenantId, {
      repEmail: "alice@team.com",
      period,
      commissionCents: 15_000,
      baseAmountCents: 100_000,
      accelerator: 1.5,
      attainmentPercent: 120,
      status: "draft",
      paidAt: null,
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg-x",
          model: "x",
          content: [{ type: "text", text: "Alice hit 120% so..." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 30, output_tokens: 50 },
        }),
        { status: 200 },
      ),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/explain-commission-amount",
      method: "POST",
      body: { payoutId: payout.id },
      tenantId,
    });
    const response = await explainCommissionAmount(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      math: {
        baseAmountCents: number;
        effectiveRate: number;
        recomputedCommissionCents: number;
        matchesStored: boolean;
      };
      explanation?: string;
      plan: { name: string };
    };
    expect(json.plan.name).toBe("Q1 Plan");
    expect(json.math.baseAmountCents).toBe(100_000);
    expect(json.math.effectiveRate).toBe(0.15);
    expect(json.math.recomputedCommissionCents).toBe(15_000);
    expect(json.math.matchesStored).toBe(true);
    expect(json.explanation).toContain("Alice hit 120%");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips Claude call when generateExplanation=false (no-op AI path)", async () => {
    const period = "2026-Q2";
    await compPlanRepository.create(tenantId, {
      name: "Q2",
      baseRate: 0.1,
      accelerators: [],
      period,
    });
    const payout = await payoutRepository.create(tenantId, {
      repEmail: "bob@team.com",
      period,
      commissionCents: 0,
      baseAmountCents: 0,
      accelerator: 1,
      attainmentPercent: 0,
      status: "draft",
      paidAt: null,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/explain-commission-amount",
      method: "POST",
      body: { payoutId: payout.id, generateExplanation: false },
      tenantId,
    });
    const response = await explainCommissionAmount(request, context);
    const json = (await response.json()) as { explanation?: string };
    expect(json.explanation).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles missing plan gracefully", async () => {
    const period = "2026-Q3";
    const payout = await payoutRepository.create(tenantId, {
      repEmail: "carol@team.com",
      period,
      commissionCents: 0,
      baseAmountCents: 0,
      accelerator: 1,
      attainmentPercent: 50,
      status: "draft",
      paidAt: null,
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/explain-commission-amount",
      method: "POST",
      body: { payoutId: payout.id, generateExplanation: false },
      tenantId,
    });
    const response = await explainCommissionAmount(request, context);
    const json = (await response.json()) as {
      plan: unknown;
      math: { baseRate: number | null };
    };
    expect(json.plan).toBeNull();
    expect(json.math.baseRate).toBeNull();
  });

  it("isolates payouts/credits to caller's tenant", async () => {
    const period = "2026-Q4";
    await compPlanRepository.create(tenantId, {
      name: "Q4",
      baseRate: 0.1,
      accelerators: [],
      period,
    });
    // Tenant-b credit shouldn't be referenced.
    await creditRepository.create("tenant-b", {
      repEmail: "alice@team.com",
      dealId: "leak",
      amountCents: 999_999,
      period,
      splitPercent: 100,
      creditedAt: new Date().toISOString(),
    });
    await creditRepository.create(tenantId, {
      repEmail: "alice@team.com",
      dealId: "d-1",
      amountCents: 1_000,
      period,
      splitPercent: 100,
      creditedAt: new Date().toISOString(),
    });
    const payout = await payoutRepository.create(tenantId, {
      repEmail: "alice@team.com",
      period,
      commissionCents: 100,
      baseAmountCents: 1_000,
      accelerator: 1,
      attainmentPercent: 10,
      status: "draft",
      paidAt: null,
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/explain-commission-amount",
      method: "POST",
      body: { payoutId: payout.id, generateExplanation: false },
      tenantId,
    });
    const response = await explainCommissionAmount(request, context);
    const json = (await response.json()) as {
      math: { baseAmountCents: number };
    };
    expect(json.math.baseAmountCents).toBe(1_000);
  });
});

describe("orchestrators/flag-clawback-risk", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });
  afterEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });

  it("flags approved/paid payouts whose deals went closed_lost or refunded", async () => {
    const period = "2026-Q1";
    await creditRepository.create(tenantId, {
      repEmail: "alice@team.com",
      dealId: "d-bad",
      amountCents: 50_000,
      period,
      splitPercent: 100,
      creditedAt: new Date().toISOString(),
      dealStatus: "closed_lost",
    });
    await creditRepository.create(tenantId, {
      repEmail: "bob@team.com",
      dealId: "d-good",
      amountCents: 50_000,
      period,
      splitPercent: 100,
      creditedAt: new Date().toISOString(),
      dealStatus: "closed_won",
    });
    await payoutRepository.create(tenantId, {
      repEmail: "alice@team.com",
      period,
      commissionCents: 5_000,
      baseAmountCents: 50_000,
      accelerator: 1,
      attainmentPercent: 50,
      status: "approved",
      paidAt: null,
    });
    await payoutRepository.create(tenantId, {
      repEmail: "bob@team.com",
      period,
      commissionCents: 5_000,
      baseAmountCents: 50_000,
      accelerator: 1,
      attainmentPercent: 50,
      status: "approved",
      paidAt: null,
    });
    // Draft payout — should be ignored even though credit went bad.
    await creditRepository.create(tenantId, {
      repEmail: "carol@team.com",
      dealId: "d-bad-2",
      amountCents: 10_000,
      period,
      splitPercent: 100,
      creditedAt: new Date().toISOString(),
      dealStatus: "refunded",
    });
    await payoutRepository.create(tenantId, {
      repEmail: "carol@team.com",
      period,
      commissionCents: 1_000,
      baseAmountCents: 10_000,
      accelerator: 1,
      attainmentPercent: 10,
      status: "draft",
      paidAt: null,
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/flag-clawback-risk",
      method: "POST",
      body: {},
      tenantId,
    });
    const response = await flagClawbackRisk(request, context);
    const json = (await response.json()) as {
      count: number;
      totalExposureCents: number;
      items: Array<{ payout: { repEmail: string }; exposureCents: number }>;
    };
    expect(json.count).toBe(1);
    expect(json.items[0].payout.repEmail).toBe("alice@team.com");
    expect(json.items[0].exposureCents).toBe(50_000);
    expect(json.totalExposureCents).toBe(50_000);
  });

  it("returns 0 when no risky credits (no-op)", async () => {
    await creditRepository.create(tenantId, {
      repEmail: "alice@team.com",
      dealId: "d-good",
      amountCents: 10_000,
      period: "2026-Q1",
      splitPercent: 100,
      creditedAt: new Date().toISOString(),
      dealStatus: "closed_won",
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/flag-clawback-risk",
      method: "POST",
      body: {},
      tenantId,
    });
    const response = await flagClawbackRisk(request, context);
    const json = (await response.json()) as { count: number; items: unknown[] };
    expect(json.count).toBe(0);
    expect(json.items).toEqual([]);
  });

  it("isolates results to caller's tenant", async () => {
    const period = "2026-Q1";
    // tenant-b risky credit + payout — should NOT show up
    await creditRepository.create("tenant-b", {
      repEmail: "alice@team.com",
      dealId: "leak",
      amountCents: 100_000,
      period,
      splitPercent: 100,
      creditedAt: new Date().toISOString(),
      dealStatus: "closed_lost",
    });
    await payoutRepository.create("tenant-b", {
      repEmail: "alice@team.com",
      period,
      commissionCents: 10_000,
      baseAmountCents: 100_000,
      accelerator: 1,
      attainmentPercent: 100,
      status: "approved",
      paidAt: null,
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/flag-clawback-risk",
      method: "POST",
      body: {},
      tenantId,
    });
    const response = await flagClawbackRisk(request, context);
    const json = (await response.json()) as { count: number };
    expect(json.count).toBe(0);
  });
});

describe("orchestrators/model-what-if-close", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
  });
  afterEach(async () => {
    await clearAll(tenantId);
  });

  it("projects new commission with extra credit", async () => {
    const period = "2026-Q1";
    await compPlanRepository.create(tenantId, {
      name: "Q1",
      baseRate: 0.1,
      accelerators: [{ threshold: 100, rate: 0.15 }],
      period,
    });
    await quotaRepository.create(tenantId, {
      repEmail: "alice@team.com",
      period,
      quotaCents: 100_000,
    });
    await payoutRepository.create(tenantId, {
      repEmail: "alice@team.com",
      period,
      commissionCents: 5_000,
      baseAmountCents: 50_000,
      accelerator: 1,
      attainmentPercent: 50,
      status: "draft",
      paidAt: null,
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/model-what-if-close",
      method: "POST",
      body: {
        repEmail: "alice@team.com",
        period,
        additionalCents: 60_000,
      },
      tenantId,
    });
    const response = await modelWhatIfClose(request, context);
    const json = (await response.json()) as {
      projected: {
        baseAmountCents: number;
        attainmentPercent: number;
        rate: number;
        commissionCents: number;
      };
      delta: { commissionCents: number };
    };
    expect(json.projected.baseAmountCents).toBe(110_000);
    expect(json.projected.attainmentPercent).toBe(110);
    expect(json.projected.rate).toBe(0.15);
    expect(json.projected.commissionCents).toBe(16_500);
    expect(json.delta.commissionCents).toBe(11_500);
  });

  it("returns 404 when plan is missing for the period", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/model-what-if-close",
      method: "POST",
      body: {
        repEmail: "alice@team.com",
        period: "no-such-period",
        additionalCents: 1_000,
      },
      tenantId,
    });
    const response = await modelWhatIfClose(request, context);
    expect(response.status).toBe(404);
  });

  it("falls back to baseRate when no accelerator triggered", async () => {
    const period = "2026-Q2";
    await compPlanRepository.create(tenantId, {
      name: "Q2",
      baseRate: 0.05,
      accelerators: [{ threshold: 100, rate: 0.1 }],
      period,
    });
    await quotaRepository.create(tenantId, {
      repEmail: "bob@team.com",
      period,
      quotaCents: 100_000,
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/model-what-if-close",
      method: "POST",
      body: {
        repEmail: "bob@team.com",
        period,
        additionalCents: 50_000,
      },
      tenantId,
    });
    const response = await modelWhatIfClose(request, context);
    const json = (await response.json()) as {
      projected: { rate: number; commissionCents: number };
    };
    expect(json.projected.rate).toBe(0.05);
    expect(json.projected.commissionCents).toBe(2_500);
  });
});

describe("handlers/approve-payout (Slack fan-out)", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_DEFAULT_CHANNEL;
    delete process.env.SLACK_WEBHOOK_URL;
    await clearAll(tenantId);
  });

  it("approves payout and posts Slack message when configured", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_DEFAULT_CHANNEL = "C1";
    const payout = await payoutRepository.create(tenantId, {
      repEmail: "alice@team.com",
      period: "2026-Q1",
      commissionCents: 25_000,
      baseAmountCents: 100_000,
      accelerator: 1,
      attainmentPercent: 100,
      status: "draft",
      paidAt: null,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ts: "1.0" }), { status: 200 }),
    );
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: `https://kit.test/payouts/${payout.id}/approve`,
      method: "POST",
      body: {},
      params: { id: payout.id },
      tenantId,
    });
    const response = await approvePayout(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      status: string;
      slack?: { ok: boolean };
    };
    expect(json.status).toBe("approved");
    expect(json.slack?.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT post to Slack when notifySlack=false", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_DEFAULT_CHANNEL = "C1";
    const payout = await payoutRepository.create(tenantId, {
      repEmail: "alice@team.com",
      period: "2026-Q1",
      commissionCents: 0,
      baseAmountCents: 0,
      accelerator: 1,
      attainmentPercent: 0,
      status: "draft",
      paidAt: null,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: `https://kit.test/payouts/${payout.id}/approve`,
      method: "POST",
      body: { notifySlack: false },
      params: { id: payout.id },
      tenantId,
    });
    const response = await approvePayout(request, context);
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const json = (await response.json()) as {
      status: string;
      slack?: unknown;
    };
    expect(json.status).toBe("approved");
    expect(json.slack).toBeUndefined();
  });

  it("does NOT post to Slack when neither token nor webhook is set", async () => {
    const payout = await payoutRepository.create(tenantId, {
      repEmail: "alice@team.com",
      period: "2026-Q1",
      commissionCents: 0,
      baseAmountCents: 0,
      accelerator: 1,
      attainmentPercent: 0,
      status: "draft",
      paidAt: null,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: `https://kit.test/payouts/${payout.id}/approve`,
      method: "POST",
      body: {},
      params: { id: payout.id },
      tenantId,
    });
    const response = await approvePayout(request, context);
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
