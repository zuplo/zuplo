import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import findUncoded from "../modules/mcp-tools/find-uncoded-transactions.ts";
import recommendLimitChange from "../modules/mcp-tools/recommend-limit-change.ts";
import syncRamp from "../modules/mcp-tools/sync-ramp-transactions.ts";
import listTransactions from "../modules/handlers/list-transactions.ts";
import listCards from "../modules/handlers/list-cards.ts";
import { transactionRepository } from "../modules/repositories/transactions.ts";
import { cardRepository } from "../modules/repositories/cards.ts";
import type { ZuploRequest, ZuploContext } from "@zuplo/runtime";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

// Stub for /cards/:id GET (not present as a handler in this kit, but the
// recommend_limit_change orchestrator hits it via invokeJson).
async function getCardHandler(req: ZuploRequest, _ctx: ZuploContext) {
  const tenantId = (req.user?.data as { tenantId: string })?.tenantId;
  const card = await cardRepository.get(tenantId, req.params!.id);
  if (!card) {
    return new Response("not found", { status: 404 });
  }
  return new Response(JSON.stringify(card), {
    headers: { "content-type": "application/json" },
  });
}

const routes = {
  "GET /transactions": listTransactions,
  "GET /cards": listCards,
  "GET /cards/{id}": getCardHandler,
};

async function clearAll() {
  for (const t of ["tenant-a", "tenant-b"]) {
    for (const repo of [transactionRepository, cardRepository]) {
      const items = await repo.list(t, { limit: 200 });
      for (const i of items.items) await repo.delete(t, i.id);
    }
  }
}

describe("orchestrators/find_uncoded_transactions", () => {
  beforeEach(async () => {
    await clearAll();
    setEnv("SLACK_BOT_TOKEN", "xoxb-test");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("SLACK_BOT_TOKEN");
    clearEnv("SLACK_FINANCE_CHANNEL");
  });

  async function seed(tenantId: string) {
    const card = await cardRepository.create(tenantId, {
      employeeEmail: "alice@acme.com",
      last4: "1234",
      status: "active",
      spendLimitCents: 100000,
      intervalDays: 30,
      currentSpendCents: 0,
      createdAt: "2024-01-01T00:00:00Z",
    });
    const tx = await transactionRepository.create(tenantId, {
      cardId: card.id,
      amountCents: 5000,
      currency: "USD",
      merchantName: "Restaurant",
      mcc: "5812",
      postedAt: new Date(Date.now() - 86400000).toISOString(),
      category: null,
      glCode: null,
      memo: null,
      status: "posted",
      coded: false,
    });
    return { card, tx };
  }

  it("happy path: finds uncoded txns and DMs each cardholder when notifySlack=true", async () => {
    const tenantId = "tenant-a";
    await seed(tenantId);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("users.lookupByEmail")) {
        return new Response(
          JSON.stringify({ ok: true, user: { id: "U1", name: "alice", real_name: "Alice" } }),
          { status: 200 },
        );
      }
      if (url.includes("chat.postMessage")) {
        return new Response(JSON.stringify({ ok: true, ts: "1", channel: "U1" }), { status: 200 });
      }
      return new Response("unexpected " + url, { status: 500 });
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/find-uncoded-transactions",
      method: "POST",
      body: { notifySlack: true },
      tenantId,
    });
    const res = await findUncoded(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      count: number;
      slackNotifications?: { ok: boolean }[];
    };
    expect(json.count).toBe(1);
    expect(json.slackNotifications).toBeDefined();
    expect(json.slackNotifications?.[0].ok).toBe(true);
    const dmCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("chat.postMessage"),
    )!;
    expect(dmCall).toBeTruthy();
  });

  it("no-op when there are no transactions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/find-uncoded-transactions",
      method: "POST",
      body: { notifySlack: true },
      tenantId: "tenant-a",
    });
    const res = await findUncoded(request, context);
    const json = (await res.json()) as { count: number };
    expect(json.count).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("notifySlack=false: lists uncoded but does not DM", async () => {
    const tenantId = "tenant-a";
    await seed(tenantId);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/find-uncoded-transactions",
      method: "POST",
      body: { notifySlack: false },
      tenantId,
    });
    const res = await findUncoded(request, context);
    const json = (await res.json()) as { count: number; slackNotifications?: unknown[] };
    expect(json.count).toBe(1);
    expect(json.slackNotifications).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("isolates tenants", async () => {
    await seed("tenant-a");
    await seed("tenant-b");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/find-uncoded-transactions",
      method: "POST",
      body: { notifySlack: false },
      tenantId: "tenant-a",
    });
    const res = await findUncoded(request, context);
    const json = (await res.json()) as {
      count: number;
      transactions: { tenantId: string }[];
    };
    expect(json.count).toBe(1);
    expect(json.transactions[0].tenantId).toBe("tenant-a");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("orchestrators/recommend_limit_change", () => {
  beforeEach(clearAll);

  it("happy path: recommends increase when 90d spend > 1.5x limit", async () => {
    const tenantId = "tenant-a";
    const card = await cardRepository.create(tenantId, {
      employeeEmail: "x@y.com", last4: "9999", status: "active",
      spendLimitCents: 10000, intervalDays: 30, currentSpendCents: 0,
      createdAt: "2024-01-01T00:00:00Z",
    });
    // Create txns summing >15000 in last 90 days
    for (let i = 0; i < 4; i++) {
      await transactionRepository.create(tenantId, {
        cardId: card.id,
        amountCents: 4000,
        currency: "USD",
        merchantName: "M",
        mcc: "0",
        postedAt: new Date(Date.now() - i * 86400000).toISOString(),
        category: null, glCode: null, memo: null, status: "posted", coded: true,
      });
    }
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/recommend-limit-change",
      method: "POST",
      body: { cardId: card.id },
      tenantId,
    });
    const res = await recommendLimitChange(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      recommendation: string;
      recommendedLimitCents: number;
    };
    expect(json.recommendation).toBe("increase");
    expect(json.recommendedLimitCents).toBe(15000);
  });

  it("recommends decrease when 90d spend < 0.3x limit", async () => {
    const tenantId = "tenant-a";
    const card = await cardRepository.create(tenantId, {
      employeeEmail: "x@y.com", last4: "9999", status: "active",
      spendLimitCents: 100000, intervalDays: 30, currentSpendCents: 0,
      createdAt: "2024-01-01T00:00:00Z",
    });
    await transactionRepository.create(tenantId, {
      cardId: card.id, amountCents: 1000, currency: "USD",
      merchantName: "M", mcc: "0",
      postedAt: new Date().toISOString(),
      category: null, glCode: null, memo: null, status: "posted", coded: true,
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/recommend-limit-change",
      method: "POST",
      body: { cardId: card.id },
      tenantId,
    });
    const res = await recommendLimitChange(request, context);
    const json = (await res.json()) as { recommendation: string; recommendedLimitCents: number };
    expect(json.recommendation).toBe("decrease");
    expect(json.recommendedLimitCents).toBe(75000);
  });

  it("recommends keep when usage is within band", async () => {
    const tenantId = "tenant-a";
    const card = await cardRepository.create(tenantId, {
      employeeEmail: "x@y.com", last4: "9999", status: "active",
      spendLimitCents: 100000, intervalDays: 30, currentSpendCents: 0,
      createdAt: "2024-01-01T00:00:00Z",
    });
    await transactionRepository.create(tenantId, {
      cardId: card.id, amountCents: 50000, currency: "USD",
      merchantName: "M", mcc: "0",
      postedAt: new Date().toISOString(),
      category: null, glCode: null, memo: null, status: "posted", coded: true,
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/recommend-limit-change",
      method: "POST",
      body: { cardId: card.id },
      tenantId,
    });
    const res = await recommendLimitChange(request, context);
    const json = (await res.json()) as { recommendation: string };
    expect(json.recommendation).toBe("keep");
  });
});

describe("orchestrators/sync_ramp_transactions", () => {
  beforeEach(async () => {
    await clearAll();
    setEnv("RAMP_CLIENT_ID", "cid_test");
    setEnv("RAMP_CLIENT_SECRET", "sec_test");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RAMP_CLIENT_ID");
    clearEnv("RAMP_CLIENT_SECRET");
  });

  it("happy path: imports a Ramp txn into local store", async () => {
    const tenantId = "tenant-a";
    const card = await cardRepository.create(tenantId, {
      employeeEmail: "x@y.com",
      last4: "ramp-card-1",
      status: "active",
      spendLimitCents: 100000,
      intervalDays: 30,
      currentSpendCents: 0,
      createdAt: "2024-01-01T00:00:00Z",
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/token")) {
        return new Response(
          JSON.stringify({ access_token: "tok", expires_in: 3600 }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "ramp-txn-1",
              amount: 12.34,
              currency_code: "USD",
              user_transaction_time: "2024-04-15T10:00:00Z",
              merchant_name: "Coffee",
              merchant_category_code: 5812,
              state: "CLEARED",
              card_id: "ramp-card-1",
              user_id: "u1",
              sk_category_id: 1,
              sk_category_name: "meals",
              memo: null,
              policy_violations: [],
              receipts: [],
            },
          ],
          page: { next: null },
        }),
        { status: 200 },
      );
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/sync-ramp-transactions",
      method: "POST",
      body: {},
      tenantId,
    });
    const res = await syncRamp(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { imported: number; updated: number };
    expect(json.imported + json.updated).toBeGreaterThanOrEqual(1);
    const txns = await transactionRepository.list(tenantId, { limit: 10 });
    expect(txns.items.find((t) => t.cardId === card.id)).toBeTruthy();
  });

  it("no-op (with unknownCards) when no local card matches the Ramp card_id", async () => {
    const tenantId = "tenant-a";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/token")) {
        return new Response(
          JSON.stringify({ access_token: "tok", expires_in: 3600 }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "ramp-txn-orphan",
              amount: 1.0,
              currency_code: "USD",
              user_transaction_time: "2024-04-15T10:00:00Z",
              merchant_name: "M",
              merchant_category_code: null,
              state: "CLEARED",
              card_id: "ramp-card-orphan",
              user_id: "u1",
              sk_category_id: null,
              sk_category_name: null,
              memo: null,
              policy_violations: [],
              receipts: [],
            },
          ],
          page: { next: null },
        }),
        { status: 200 },
      );
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/sync-ramp-transactions",
      method: "POST",
      body: {},
      tenantId,
    });
    const res = await syncRamp(request, context);
    const json = (await res.json()) as { imported: number; unknownCardCount: number };
    expect(json.imported).toBe(0);
    expect(json.unknownCardCount).toBeGreaterThanOrEqual(1);
  });
});
