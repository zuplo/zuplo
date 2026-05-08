import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import compareAttributionModels from "../modules/mcp-tools/compare-attribution-models.ts";
import explainConversionPath from "../modules/mcp-tools/explain-conversion-path.ts";
import findUnderratedChannels from "../modules/mcp-tools/find-underrated-channels.ts";
import listTouchpoints from "../modules/handlers/list-touchpoints.ts";
import listConversions from "../modules/handlers/list-conversions.ts";
import listAttributionModels from "../modules/handlers/list-attribution-models.ts";
import {
  attributionModelRepository,
  conversionRepository,
  touchpointRepository,
  visitorRepository,
  type AttributionModel,
  type Conversion,
  type Touchpoint,
  type Visitor,
} from "../modules/repositories/touchpoints.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

const routes = {
  "GET /touchpoints": listTouchpoints,
  "GET /conversions": listConversions,
  "GET /attribution-models": listAttributionModels,
};

async function clearAll(tenants = ["tenant-a", "tenant-b"]) {
  for (const t of tenants) {
    for (const repo of [
      touchpointRepository,
      conversionRepository,
      visitorRepository,
      attributionModelRepository,
    ]) {
      const page = await repo.list(t, { limit: 200 });
      for (const i of page.items) await repo.delete(t, i.id);
    }
  }
}

async function seedVisitor(
  tenantId: string,
  overrides: Partial<Omit<Visitor, "id" | "tenantId">> = {},
): Promise<Visitor> {
  return visitorRepository.create(tenantId, {
    anonymousId: overrides.anonymousId ?? `v_${Math.random()}`,
    firstSeenAt: overrides.firstSeenAt ?? "2024-01-01T00:00:00Z",
    lastSeenAt: overrides.lastSeenAt ?? "2024-01-02T00:00:00Z",
    identifiedEmail: overrides.identifiedEmail ?? null,
    attributes: overrides.attributes ?? {},
  });
}

async function seedTouchpoint(
  tenantId: string,
  data: Partial<Omit<Touchpoint, "id" | "tenantId">> & {
    visitorId: string;
    occurredAt: string;
    channel: Touchpoint["channel"];
  },
): Promise<Touchpoint> {
  return touchpointRepository.create(tenantId, {
    visitorId: data.visitorId,
    channel: data.channel,
    campaignName: data.campaignName ?? "",
    source: data.source ?? "",
    medium: data.medium ?? "",
    occurredAt: data.occurredAt,
    url: data.url ?? "",
    sessionId: data.sessionId ?? "",
  });
}

async function seedConversion(
  tenantId: string,
  data: Partial<Omit<Conversion, "id" | "tenantId">> & {
    visitorId: string;
    occurredAt: string;
    valueCents: number;
  },
): Promise<Conversion> {
  return conversionRepository.create(tenantId, {
    visitorId: data.visitorId,
    kind: data.kind ?? "purchase",
    valueCents: data.valueCents,
    occurredAt: data.occurredAt,
    dealId: data.dealId ?? null,
  });
}

async function seedModel(
  tenantId: string,
  data: Partial<Omit<AttributionModel, "id" | "tenantId">> & {
    slug: string;
    kind: AttributionModel["kind"];
  },
): Promise<AttributionModel> {
  return attributionModelRepository.create(tenantId, {
    slug: data.slug,
    name: data.name ?? data.slug,
    weights: data.weights ?? {},
    kind: data.kind,
  });
}

// ---------------------------------------------------------------------------
// compare_attribution_models
// ---------------------------------------------------------------------------

describe("orchestrators/compare_attribution_models", () => {
  beforeEach(async () => {
    await clearAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: computes per-channel attribution under each model", async () => {
    const v = await seedVisitor("tenant-a");
    // Path: paid_search -> email -> conversion of $100
    await seedTouchpoint("tenant-a", {
      visitorId: v.id,
      channel: "paid_search",
      occurredAt: "2024-01-01T00:00:00Z",
    });
    await seedTouchpoint("tenant-a", {
      visitorId: v.id,
      channel: "email",
      occurredAt: "2024-01-02T00:00:00Z",
    });
    await seedConversion("tenant-a", {
      visitorId: v.id,
      occurredAt: "2024-01-03T00:00:00Z",
      valueCents: 10000,
    });
    await seedModel("tenant-a", { slug: "first", kind: "first" });
    await seedModel("tenant-a", { slug: "last", kind: "last" });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/compare-attribution-models",
      method: "POST",
      body: { dateFrom: "2024-01-01", dateTo: "2024-01-31" },
      tenantId: "tenant-a",
    });
    const res = await compareAttributionModels(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      modelCount: number;
      conversionCount: number;
      attributionByModel: Record<string, Record<string, number>>;
    };
    expect(json.modelCount).toBe(2);
    expect(json.conversionCount).toBe(1);
    expect(json.attributionByModel.first.paid_search).toBe(10000);
    expect(json.attributionByModel.last.email).toBe(10000);
  });

  it("no-op: empty data returns 0 counts", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/compare-attribution-models",
      method: "POST",
      body: { dateFrom: "2024-01-01", dateTo: "2024-01-31" },
      tenantId: "tenant-a",
    });
    const res = await compareAttributionModels(request, context);
    const json = (await res.json()) as {
      modelCount: number;
      conversionCount: number;
    };
    expect(json.modelCount).toBe(0);
    expect(json.conversionCount).toBe(0);
  });

  it("returns 400 when dates are missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/compare-attribution-models",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await compareAttributionModels(request, context);
    expect(res.status).toBe(400);
  });

  it("multi-tenant isolation: tenant-a does not see tenant-b's data", async () => {
    const v = await seedVisitor("tenant-b");
    await seedTouchpoint("tenant-b", {
      visitorId: v.id,
      channel: "social",
      occurredAt: "2024-01-01T00:00:00Z",
    });
    await seedConversion("tenant-b", {
      visitorId: v.id,
      occurredAt: "2024-01-02T00:00:00Z",
      valueCents: 1000,
    });
    await seedModel("tenant-b", { slug: "first", kind: "first" });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/compare-attribution-models",
      method: "POST",
      body: { dateFrom: "2024-01-01", dateTo: "2024-01-31" },
      tenantId: "tenant-a",
    });
    const res = await compareAttributionModels(request, context);
    const json = (await res.json()) as {
      modelCount: number;
      conversionCount: number;
    };
    expect(json.modelCount).toBe(0);
    expect(json.conversionCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// explain_conversion_path
// ---------------------------------------------------------------------------

describe("orchestrators/explain_conversion_path", () => {
  beforeEach(async () => {
    await clearAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("DB_PROVIDER");
    clearEnv("CLICKHOUSE_URL");
    clearEnv("CLICKHOUSE_PASSWORD");
  });

  it("happy path (memory): walks visitor's path and applies attribution models", async () => {
    const v = await seedVisitor("tenant-a");
    await seedTouchpoint("tenant-a", {
      visitorId: v.id,
      channel: "paid_search",
      occurredAt: "2024-01-01",
    });
    await seedTouchpoint("tenant-a", {
      visitorId: v.id,
      channel: "email",
      occurredAt: "2024-01-02",
    });
    await seedConversion("tenant-a", {
      visitorId: v.id,
      occurredAt: "2024-01-03",
      valueCents: 1000,
    });
    await seedModel("tenant-a", { slug: "first", kind: "first" });
    await seedModel("tenant-a", { slug: "linear", kind: "linear" });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/explain-conversion-path",
      method: "POST",
      body: { visitorId: v.id },
      tenantId: "tenant-a",
    });
    const res = await explainConversionPath(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      backend: string;
      touchpointCount: number;
      conversionCount: number;
      attribution: Record<string, Array<{ channel: string; valueCents: number }>>;
    };
    expect(json.backend).toBe("memory");
    expect(json.touchpointCount).toBe(2);
    expect(json.conversionCount).toBe(1);
    expect(json.attribution.first[0].channel).toBe("paid_search");
    expect(json.attribution.first[0].valueCents).toBe(1000);
    expect(json.attribution.linear[0].valueCents).toBe(500);
    expect(json.attribution.linear[1].valueCents).toBe(500);
  });

  it("no-op: visitor with no touchpoints returns empty path", async () => {
    const v = await seedVisitor("tenant-a");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/explain-conversion-path",
      method: "POST",
      body: { visitorId: v.id },
      tenantId: "tenant-a",
    });
    const res = await explainConversionPath(request, context);
    const json = (await res.json()) as {
      touchpointCount: number;
      conversionCount: number;
      lastConversion: unknown;
    };
    expect(json.touchpointCount).toBe(0);
    expect(json.conversionCount).toBe(0);
    expect(json.lastConversion).toBeNull();
  });

  it("returns 400 when visitorId is missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/explain-conversion-path",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await explainConversionPath(request, context);
    expect(res.status).toBe(400);
  });

  it("ClickHouse backend used when DB_PROVIDER=clickhouse", async () => {
    setEnv("DB_PROVIDER", "clickhouse");
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    await seedModel("tenant-a", { slug: "first", kind: "first" });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      // First: conversion lookup.
      .mockResolvedValueOnce(
        new Response(
          `{"id":"c1","valueCents":"1000","occurredAt":"2024-01-03"}\n`,
          { status: 200 },
        ),
      )
      // Second: touchpoints.
      .mockResolvedValueOnce(
        new Response(
          `{"id":"tp1","channel":"paid_search","campaignName":"","source":"","medium":"","occurredAt":"2024-01-01","url":""}\n`,
          { status: 200 },
        ),
      );

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/explain-conversion-path",
      method: "POST",
      body: { visitorId: "v_1" },
      tenantId: "tenant-a",
    });
    const res = await explainConversionPath(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { backend: string; touchpointCount: number };
    expect(json.backend).toBe("clickhouse");
    expect(json.touchpointCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("multi-tenant isolation: tenant-a's lookup doesn't see tenant-b's data", async () => {
    const v = await seedVisitor("tenant-b");
    await seedTouchpoint("tenant-b", {
      visitorId: v.id,
      channel: "paid_search",
      occurredAt: "2024-01-01",
    });
    await seedModel("tenant-a", { slug: "first", kind: "first" });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/explain-conversion-path",
      method: "POST",
      body: { visitorId: v.id },
      tenantId: "tenant-a",
    });
    const res = await explainConversionPath(request, context);
    const json = (await res.json()) as { touchpointCount: number };
    expect(json.touchpointCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// find_underrated_channels
// ---------------------------------------------------------------------------

describe("orchestrators/find_underrated_channels", () => {
  beforeEach(async () => {
    await clearAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of [
      "DB_PROVIDER",
      "CLICKHOUSE_URL",
      "CLICKHOUSE_PASSWORD",
      "META_PAGE_ACCESS_TOKEN",
      "META_AD_ACCOUNT_ID",
      "GOOGLE_ADS_DEVELOPER_TOKEN",
      "GOOGLE_ADS_OAUTH_ACCESS_TOKEN",
      "GOOGLE_ADS_CUSTOMER_ID",
    ]) {
      clearEnv(k);
    }
  });

  it("happy path (memory): ranks channels with no spend layer", async () => {
    // Create two visitors. Visitor A: brand_search assist, then paid_search close.
    // Visitor B: same shape. Last-touch credits paid_search 100%; linear/position
    // credit assist channels too — so brand_search should look "underrated".
    const recent = (mins: number) =>
      new Date(Date.now() - mins * 60_000).toISOString();
    for (let i = 0; i < 3; i++) {
      const v = await seedVisitor("tenant-a");
      await seedTouchpoint("tenant-a", {
        visitorId: v.id,
        channel: "organic",
        occurredAt: recent(120 + i),
      });
      await seedTouchpoint("tenant-a", {
        visitorId: v.id,
        channel: "paid_search",
        occurredAt: recent(60 + i),
      });
      await seedConversion("tenant-a", {
        visitorId: v.id,
        occurredAt: recent(30 + i),
        valueCents: 10000,
      });
    }
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/find-underrated-channels",
      method: "POST",
      body: { skipSpend: true },
      tenantId: "tenant-a",
    });
    const res = await findUnderratedChannels(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      backend: string;
      channelCount: number;
      conversionCount: number;
      underratedChannels: Array<{ channel: string; underratedRatio: number }>;
    };
    expect(json.backend).toBe("memory");
    expect(json.channelCount).toBeGreaterThan(0);
    expect(json.conversionCount).toBe(3);
    // "organic" has no last-touch credit (always assisted) so it should be underrated.
    const organicHit = json.underratedChannels.find((c) => c.channel === "organic");
    expect(organicHit).toBeDefined();
  });

  it("no-op: empty data returns zero conversions and no underrated channels", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/find-underrated-channels",
      method: "POST",
      body: { skipSpend: true },
      tenantId: "tenant-a",
    });
    const res = await findUnderratedChannels(request, context);
    const json = (await res.json()) as {
      conversionCount: number;
      underratedChannels: unknown[];
    };
    expect(json.conversionCount).toBe(0);
    expect(json.underratedChannels).toEqual([]);
  });

  it("skipSpend=false fans out to Meta + Google when configured", async () => {
    setEnv("META_PAGE_ACCESS_TOKEN", "T");
    setEnv("META_AD_ACCOUNT_ID", "act_123");
    setEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "DEV");
    setEnv("GOOGLE_ADS_CUSTOMER_ID", "555");
    setEnv("GOOGLE_ADS_OAUTH_ACCESS_TOKEN", "ya29.test");

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const u = String(input);
        if (u.includes("/insights")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  campaign_name: "Sale",
                  spend: "5.00",
                  impressions: "100",
                  clicks: "5",
                  date_start: "x",
                  date_stop: "x",
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (u.includes("googleAds:searchStream")) {
          return new Response(
            JSON.stringify([
              {
                results: [
                  {
                    campaign: { id: "c1", name: "Brand" },
                    metrics: {
                      costMicros: "10000000",
                      impressions: "100",
                      clicks: "10",
                    },
                    segments: { date: "x" },
                  },
                ],
              },
            ]),
            { status: 200 },
          );
        }
        return new Response("unmocked: " + u, { status: 500 });
      });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/find-underrated-channels",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await findUnderratedChannels(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      spendSources: { meta: boolean; google: boolean };
      allChannelsRanked: Array<{ channel: string; spendCents: number }>;
    };
    expect(json.spendSources.meta).toBe(true);
    expect(json.spendSources.google).toBe(true);
    const meta = json.allChannelsRanked.find((c) => c.channel === "social");
    expect(meta?.spendCents).toBe(500);
    const google = json.allChannelsRanked.find(
      (c) => c.channel === "paid_search",
    );
    expect(google?.spendCents).toBe(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("multi-tenant isolation: tenant-a sees only its own conversions", async () => {
    const v = await seedVisitor("tenant-b");
    await seedConversion("tenant-b", {
      visitorId: v.id,
      occurredAt: new Date().toISOString(),
      valueCents: 5000,
    });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/find-underrated-channels",
      method: "POST",
      body: { skipSpend: true },
      tenantId: "tenant-a",
    });
    const res = await findUnderratedChannels(request, context);
    const json = (await res.json()) as { conversionCount: number };
    expect(json.conversionCount).toBe(0);
  });
});
