/**
 * Note: subscription-billing orchestrators don't call integrations directly —
 * they only compose internal CRUD via invokeJson. We still test the composition
 * paths (happy / no-op / tenant isolation) so the wiring is verified.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import findAtRisk from "../modules/mcp-tools/find-at-risk-subscriptions.ts";
import forecastMrr from "../modules/mcp-tools/forecast-mrr.ts";
import proposeUpgrade from "../modules/mcp-tools/propose-upgrade-for-customer.ts";
import listSubscriptions from "../modules/handlers/list-subscriptions.ts";
import listPlans from "../modules/handlers/list-plans.ts";
import {
  subscriptionRepository,
  planRepository,
  usageRepository,
} from "../modules/repositories/subscriptions.ts";

async function clearAll() {
  for (const t of ["tenant-a", "tenant-b"]) {
    for (const repo of [subscriptionRepository, planRepository, usageRepository]) {
      const items = await repo.list(t, { limit: 200 });
      for (const i of items.items) await repo.delete(t, i.id);
    }
  }
}

// Stub /usage-records route since usage-records doesn't have its own list handler exported
async function listUsageRecords(req: any) {
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const page = await usageRepository.list(req.user.data.tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
  });
  return new Response(JSON.stringify(page), {
    headers: { "content-type": "application/json" },
  });
}

const routes = {
  "GET /subscriptions": listSubscriptions,
  "GET /plans": listPlans,
  "GET /usage-records": listUsageRecords as any,
};

describe("orchestrators/find_at_risk_subscriptions", () => {
  beforeEach(clearAll);

  it("happy path: returns past_due, canceling, and trial-ending subs with risk reasons", async () => {
    const tenantId = "tenant-a";
    const planId = "p1";
    const now = Date.now();
    await subscriptionRepository.create(tenantId, {
      customerId: "c1", planId, status: "past_due",
      startDate: "2024-01-01", currentPeriodStart: "2024-04-01",
      currentPeriodEnd: "2024-05-01", trialEnd: null, canceledAt: null,
      createdAt: "2024-01-01T00:00:00Z",
      stripeSubscriptionId: "sub_pd", stripeCustomerId: "cus_a",
    });
    await subscriptionRepository.create(tenantId, {
      customerId: "c2", planId, status: "active",
      startDate: "2024-01-01", currentPeriodStart: "2024-04-01",
      currentPeriodEnd: "2024-05-01", trialEnd: null,
      canceledAt: "2024-04-30T00:00:00Z", // pending cancel
      createdAt: "2024-01-01T00:00:00Z",
      stripeSubscriptionId: "sub_pc", stripeCustomerId: "cus_b",
    });
    await subscriptionRepository.create(tenantId, {
      customerId: "c3", planId, status: "active",
      startDate: "2024-01-01", currentPeriodStart: "2024-04-01",
      currentPeriodEnd: "2024-05-01",
      trialEnd: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
      canceledAt: null,
      createdAt: "2024-01-01T00:00:00Z",
      stripeSubscriptionId: "sub_tr", stripeCustomerId: "cus_c",
    });
    await subscriptionRepository.create(tenantId, {
      customerId: "c4", planId, status: "active",
      startDate: "2024-01-01", currentPeriodStart: "2024-04-01",
      currentPeriodEnd: "2024-05-01", trialEnd: null, canceledAt: null,
      createdAt: "2024-01-01T00:00:00Z",
      stripeSubscriptionId: "sub_safe", stripeCustomerId: "cus_d",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/find-at-risk-subscriptions",
      method: "POST",
      body: {},
      tenantId,
    });
    const res = await findAtRisk(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { count: number; at_risk: { risks: string[] }[] };
    expect(json.count).toBe(3);
    const risks = new Set(json.at_risk.flatMap((r) => r.risks));
    expect(risks.has("past_due")).toBe(true);
    expect(risks.has("cancellation_pending")).toBe(true);
    expect(risks.has("trial_ending_within_7d")).toBe(true);
  });

  it("no-op when there are no subscriptions", async () => {
    const tenantId = "tenant-a";
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/find-at-risk-subscriptions",
      method: "POST",
      body: {},
      tenantId,
    });
    const res = await findAtRisk(request, context);
    const json = (await res.json()) as { count: number; at_risk: unknown[] };
    expect(json.count).toBe(0);
    expect(json.at_risk).toEqual([]);
  });

  it("isolates tenants", async () => {
    await subscriptionRepository.create("tenant-a", {
      customerId: "c1", planId: "p", status: "past_due",
      startDate: "x", currentPeriodStart: "x", currentPeriodEnd: "x",
      trialEnd: null, canceledAt: null, createdAt: "x",
      stripeSubscriptionId: null, stripeCustomerId: null,
    });
    await subscriptionRepository.create("tenant-b", {
      customerId: "c2", planId: "p", status: "past_due",
      startDate: "x", currentPeriodStart: "x", currentPeriodEnd: "x",
      trialEnd: null, canceledAt: null, createdAt: "x",
      stripeSubscriptionId: null, stripeCustomerId: null,
    });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/find-at-risk-subscriptions",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await findAtRisk(request, context);
    const json = (await res.json()) as {
      count: number;
      at_risk: { subscription: { tenantId: string } }[];
    };
    expect(json.count).toBe(1);
    expect(json.at_risk[0].subscription.tenantId).toBe("tenant-a");
  });
});

describe("orchestrators/forecast_mrr", () => {
  beforeEach(clearAll);

  it("happy path: sums monthly MRR from active subs", async () => {
    const tenantId = "tenant-a";
    const monthly = await planRepository.create(tenantId, {
      name: "Monthly", intervalUnit: "month", priceCents: 1000, currency: "usd",
      includedUsage: 1000, overageRateCents: 1, createdAt: "x",
      stripePriceId: null, stripeProductId: null,
    });
    const yearly = await planRepository.create(tenantId, {
      name: "Yearly", intervalUnit: "year", priceCents: 12000, currency: "usd",
      includedUsage: 1000, overageRateCents: 1, createdAt: "x",
      stripePriceId: null, stripeProductId: null,
    });
    await subscriptionRepository.create(tenantId, {
      customerId: "c1", planId: monthly.id, status: "active",
      startDate: "x", currentPeriodStart: "x", currentPeriodEnd: "x",
      trialEnd: null, canceledAt: null, createdAt: "x",
      stripeSubscriptionId: null, stripeCustomerId: null,
    });
    await subscriptionRepository.create(tenantId, {
      customerId: "c2", planId: yearly.id, status: "active",
      startDate: "x", currentPeriodStart: "x", currentPeriodEnd: "x",
      trialEnd: null, canceledAt: null, createdAt: "x",
      stripeSubscriptionId: null, stripeCustomerId: null,
    });
    await subscriptionRepository.create(tenantId, {
      customerId: "c3", planId: monthly.id, status: "canceled",
      startDate: "x", currentPeriodStart: "x", currentPeriodEnd: "x",
      trialEnd: null, canceledAt: null, createdAt: "x",
      stripeSubscriptionId: null, stripeCustomerId: null,
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/forecast-mrr",
      method: "POST",
      body: {},
      tenantId,
    });
    const res = await forecastMrr(request, context);
    const json = (await res.json()) as {
      activeSubscriptionCount: number;
      mrrCents: number;
      arrCents: number;
    };
    expect(json.activeSubscriptionCount).toBe(2);
    expect(json.mrrCents).toBe(1000 + 1000); // monthly + yearly/12
    expect(json.arrCents).toBe(json.mrrCents * 12);
  });

  it("no-op when there are no active subs", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/forecast-mrr",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await forecastMrr(request, context);
    const json = (await res.json()) as { activeSubscriptionCount: number; mrrCents: number };
    expect(json.activeSubscriptionCount).toBe(0);
    expect(json.mrrCents).toBe(0);
  });
});

describe("orchestrators/propose_upgrade_for_customer", () => {
  beforeEach(clearAll);

  it("happy path: suggests cheapest plan that covers usage when overage", async () => {
    const tenantId = "tenant-a";
    const basic = await planRepository.create(tenantId, {
      name: "Basic", intervalUnit: "month", priceCents: 1000, currency: "usd",
      includedUsage: 100, overageRateCents: 5, createdAt: "x",
      stripePriceId: null, stripeProductId: null,
    });
    const pro = await planRepository.create(tenantId, {
      name: "Pro", intervalUnit: "month", priceCents: 3000, currency: "usd",
      includedUsage: 500, overageRateCents: 1, createdAt: "x",
      stripePriceId: null, stripeProductId: null,
    });
    await planRepository.create(tenantId, {
      name: "Enterprise", intervalUnit: "month", priceCents: 9000, currency: "usd",
      includedUsage: 5000, overageRateCents: 0, createdAt: "x",
      stripePriceId: null, stripeProductId: null,
    });
    const sub = await subscriptionRepository.create(tenantId, {
      customerId: "cust_x", planId: basic.id, status: "active",
      startDate: "2024-04-01", currentPeriodStart: "2024-04-01",
      currentPeriodEnd: "2024-05-01", trialEnd: null, canceledAt: null,
      createdAt: "x",
      stripeSubscriptionId: null, stripeCustomerId: null,
    });
    await usageRepository.create(tenantId, {
      subscriptionId: sub.id, quantity: 200,
      recordedAt: "2024-04-15T00:00:00Z",
      periodStart: "2024-04-01", periodEnd: "2024-05-01",
      createdAt: "2024-04-15T00:00:00Z",
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/propose-upgrade-for-customer",
      method: "POST",
      body: { customerId: "cust_x" },
      tenantId,
    });
    const res = await proposeUpgrade(request, context);
    const json = (await res.json()) as {
      suggestions: Array<{
        currentPeriodUsage: number;
        suggestedPlan: { id: string } | null;
        overage: number;
      }>;
    };
    expect(json.suggestions.length).toBe(1);
    expect(json.suggestions[0].currentPeriodUsage).toBe(200);
    expect(json.suggestions[0].overage).toBe(100);
    expect(json.suggestions[0].suggestedPlan?.id).toBe(pro.id);
  });

  it("returns 400 when customerId is missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/propose-upgrade-for-customer",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await proposeUpgrade(request, context);
    expect(res.status).toBe(400);
  });

  it("no-op (no_active_subscriptions) when customer has no active subs", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/propose-upgrade-for-customer",
      method: "POST",
      body: { customerId: "missing" },
      tenantId: "tenant-a",
    });
    const res = await proposeUpgrade(request, context);
    const json = (await res.json()) as { suggestions: unknown[]; reason?: string };
    expect(json.suggestions).toEqual([]);
    expect(json.reason).toBe("no_active_subscriptions");
  });
});
