import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import parseReceipt from "../modules/mcp-tools/parse-receipt.ts";
import flagPolicyViolations from "../modules/mcp-tools/flag-policy-violations.ts";
import listExpenses from "../modules/handlers/list-expenses.ts";
import listCategories from "../modules/handlers/list-categories.ts";
import listPolicies from "../modules/handlers/list-policies.ts";
import {
  expenseRepository,
  categoryRepository,
  policyRepository,
} from "../modules/repositories/expenses.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

const routes = {
  "GET /expenses": listExpenses,
  "GET /expense-categories": listCategories,
  "GET /expense-policies": listPolicies,
};

async function clearAll() {
  for (const t of ["tenant-a", "tenant-b"]) {
    for (const repo of [expenseRepository, categoryRepository, policyRepository]) {
      const items = await repo.list(t, { limit: 200 });
      for (const i of items.items) await repo.delete(t, i.id);
    }
  }
}

describe("orchestrators/parse_receipt", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("MINDEE_API_KEY");
  });

  it("calls Mindee and returns ready=true when fields are confident", async () => {
    setEnv("MINDEE_API_KEY", "mindee_test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          document: {
            inference: {
              prediction: {
                total_amount: { value: 50.0, confidence: 0.9 },
                currency: { value: "USD", confidence: 0.95 },
                date: { value: "2024-05-01", confidence: 0.9 },
                supplier_name: { value: "Acme", confidence: 0.85 },
              },
            },
          },
        }),
        { status: 200 },
      ),
    );
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/parse-receipt",
      method: "POST",
      body: { receiptUrl: "https://x.test/r.png" },
    });
    const res = await parseReceipt(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { merchant: string; ready: boolean; amountCents: number };
    expect(json.merchant).toBe("Acme");
    expect(json.amountCents).toBe(5000);
    expect(json.ready).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns 400 when receiptUrl is missing", async () => {
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/parse-receipt",
      method: "POST",
      body: {},
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const res = await parseReceipt(request, context);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ready=false when confidence is low", async () => {
    setEnv("MINDEE_API_KEY", "mindee_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          document: {
            inference: {
              prediction: {
                total_amount: { value: 1, confidence: 0.1 },
                currency: { value: null, confidence: 0 },
                date: { value: null, confidence: 0 },
                supplier_name: { value: null, confidence: 0 },
              },
            },
          },
        }),
        { status: 200 },
      ),
    );
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/parse-receipt",
      method: "POST",
      body: { receiptUrl: "https://x.test/r.png" },
    });
    const res = await parseReceipt(request, context);
    const json = (await res.json()) as { ready: boolean };
    expect(json.ready).toBe(false);
  });
});

describe("orchestrators/flag_policy_violations", () => {
  beforeEach(async () => {
    await clearAll();
    setEnv("SLACK_BOT_TOKEN", "xoxb-test");
    setEnv("SLACK_FINANCE_CHANNEL", "#finance");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("SLACK_BOT_TOKEN");
    clearEnv("SLACK_FINANCE_CHANNEL");
  });

  async function seedTenant(tenantId: string) {
    await categoryRepository.create(tenantId, {
      name: "meals",
      glCode: "6000",
      requiresReceipt: true,
      maxAmountCents: 10000,
      createdAt: "2024-01-01T00:00:00Z",
    });
    await policyRepository.create(tenantId, {
      name: "default",
      dailyLimitCents: 50000,
      perDiemLimitCents: 10000,
      requireReceiptAbove: 2500,
      createdAt: "2024-01-01T00:00:00Z",
    });
    const violator = await expenseRepository.create(tenantId, {
      employeeEmail: "alice@acme.com",
      amountCents: 15000, // exceeds maxAmountCents and dailyLimit not at all, but exceeds category cap
      currency: "USD",
      merchant: "Steakhouse",
      category: "meals",
      date: "2024-05-01",
      description: "client dinner",
      receiptUrl: null, // and missing receipt!
      status: "submitted",
      policyViolation: false,
      createdAt: "2024-05-01T12:00:00Z",
    });
    const ok = await expenseRepository.create(tenantId, {
      employeeEmail: "bob@acme.com",
      amountCents: 1000,
      currency: "USD",
      merchant: "Cafe",
      category: "meals",
      date: "2024-05-01",
      description: "coffee",
      receiptUrl: "https://r.test/x.png",
      status: "submitted",
      policyViolation: false,
      createdAt: "2024-05-01T12:00:00Z",
    });
    return { violator, ok };
  }

  it("happy path: detects violations and posts to Slack when notifySlack=true", async () => {
    const tenantId = "tenant-a";
    await seedTenant(tenantId);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, ts: "1.2", channel: "C1" }),
        { status: 200 },
      ),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/flag-policy-violations",
      method: "POST",
      body: { notifySlack: true },
      tenantId,
    });
    const res = await flagPolicyViolations(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      count: number;
      slackTs: string | null;
      violations: { reasons: string[] }[];
    };
    expect(json.count).toBe(1);
    expect(json.slackTs).toBe("1.2");
    expect(json.violations[0].reasons.length).toBeGreaterThan(0);
    const slackCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith("https://slack.com") || String(c[0]).startsWith("https://hooks.slack.com"),
    );
    expect(slackCalls.length).toBe(1);
  });

  it("no-op when there are no expenses", async () => {
    const tenantId = "tenant-a";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/flag-policy-violations",
      method: "POST",
      body: { notifySlack: true },
      tenantId,
    });
    const res = await flagPolicyViolations(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { count: number; slackTs: string | null };
    expect(json.count).toBe(0);
    expect(json.slackTs).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("notifySlack=false: detects violations but does not post to Slack", async () => {
    const tenantId = "tenant-a";
    await seedTenant(tenantId);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/flag-policy-violations",
      method: "POST",
      body: { notifySlack: false },
      tenantId,
    });
    const res = await flagPolicyViolations(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { count: number; slackTs: string | null };
    expect(json.count).toBe(1);
    expect(json.slackTs).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("isolates tenants: only tenant-a's expenses appear", async () => {
    await seedTenant("tenant-a");
    await seedTenant("tenant-b");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/flag-policy-violations",
      method: "POST",
      body: { notifySlack: false },
      tenantId: "tenant-a",
    });
    const res = await flagPolicyViolations(request, context);
    const json = (await res.json()) as { count: number; violations: { expense: { tenantId: string } }[] };
    expect(json.count).toBe(1);
    expect(json.violations[0].expense.tenantId).toBe("tenant-a");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
