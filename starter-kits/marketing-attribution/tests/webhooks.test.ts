import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import metaLeadgenWebhook from "../modules/handlers/meta-leadgen-webhook.ts";
import googleAdsConversionWebhook from "../modules/handlers/google-ads-conversion-webhook.ts";
import {
  conversionRepository,
  touchpointRepository,
  visitorRepository,
} from "../modules/repositories/touchpoints.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

async function clearAll(tenants = ["tenant-a"]) {
  for (const t of tenants) {
    for (const repo of [
      visitorRepository,
      touchpointRepository,
      conversionRepository,
    ]) {
      const page = await repo.list(t, { limit: 200 });
      for (const i of page.items) await repo.delete(t, i.id);
    }
  }
}

async function signMeta(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Meta Lead Ads webhook
// ---------------------------------------------------------------------------

describe("webhooks/meta-ads-leadgen — GET handshake", () => {
  beforeEach(() => {
    setEnv("META_VERIFY_TOKEN", "verify-secret");
  });
  afterEach(() => {
    clearEnv("META_VERIFY_TOKEN");
  });

  it("returns hub.challenge when verify token matches", async () => {
    const { context } = makeContext();
    const request = makeRequest({
      url:
        "https://kit.test/webhooks/meta-ads-leadgen?hub.mode=subscribe&hub.verify_token=verify-secret&hub.challenge=12345",
      method: "GET",
      anonymous: true,
    });
    const res = await metaLeadgenWebhook(request, context);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
  });

  it("returns 403 when verify token does not match", async () => {
    const { context } = makeContext();
    const request = makeRequest({
      url:
        "https://kit.test/webhooks/meta-ads-leadgen?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345",
      method: "GET",
      anonymous: true,
    });
    const res = await metaLeadgenWebhook(request, context);
    expect(res.status).toBe(403);
  });
});

describe("webhooks/meta-ads-leadgen — POST flow", () => {
  const SECRET = "test-app-secret";
  beforeEach(async () => {
    setEnv("META_APP_SECRET", SECRET);
    setEnv("META_PAGE_ACCESS_TOKEN", "PAGE-TOKEN");
    await clearAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("META_APP_SECRET");
    clearEnv("META_PAGE_ACCESS_TOKEN");
  });

  it("processes a valid signed lead and writes visitor + touchpoint + conversion", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "lead_1",
          created_time: "2024-05-01T00:00:00Z",
          ad_id: "ad_1",
          campaign_name: "Spring",
          form_id: "form_1",
          field_data: [
            { name: "email", values: ["lead@example.com"] },
            { name: "company", values: ["Acme"] },
          ],
        }),
        { status: 200 },
      ),
    );

    const payload = {
      object: "page",
      entry: [
        {
          id: "page_1",
          time: 1234,
          changes: [
            {
              field: "leadgen",
              value: {
                leadgen_id: "lead_1",
                page_id: "page_1",
                form_id: "form_1",
                ad_id: "ad_1",
                created_time: 1714521600,
              },
            },
          ],
        },
      ],
    };
    const raw = JSON.stringify(payload);
    const sig = await signMeta(SECRET, raw);

    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/meta-ads-leadgen?tenant=tenant-a",
      method: "POST",
      rawBody: raw,
      headers: { "x-hub-signature-256": `sha256=${sig}` },
      anonymous: true,
    });
    const res = await metaLeadgenWebhook(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { processed: number };
    expect(json.processed).toBe(1);

    // The Graph API was called once.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const visitors = await visitorRepository.list("tenant-a", { limit: 10 });
    expect(visitors.items).toHaveLength(1);
    expect(visitors.items[0].identifiedEmail).toBe("lead@example.com");
    expect(visitors.items[0].anonymousId).toBe("meta_lead:lead_1");

    const touchpoints = await touchpointRepository.list("tenant-a", { limit: 10 });
    expect(touchpoints.items).toHaveLength(1);
    expect(touchpoints.items[0].channel).toBe("social");
    expect(touchpoints.items[0].source).toBe("meta");

    const conversions = await conversionRepository.list("tenant-a", { limit: 10 });
    expect(conversions.items).toHaveLength(1);
    expect(conversions.items[0].kind).toBe("signup");
  });

  it("rejects an invalid signature with 401", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("nope", { status: 500 }));
    const payload = { object: "page", entry: [] };
    const raw = JSON.stringify(payload);
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/meta-ads-leadgen?tenant=tenant-a",
      method: "POST",
      rawBody: raw,
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
      anonymous: true,
    });
    const res = await metaLeadgenWebhook(request, context);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    const visitors = await visitorRepository.list("tenant-a", { limit: 10 });
    expect(visitors.items).toHaveLength(0);
  });

  it("acks 200 for an unknown event field (non-leadgen change)", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("nope", { status: 500 }));
    const payload = {
      object: "page",
      entry: [
        {
          id: "p_1",
          time: 0,
          changes: [
            {
              field: "messages",
              value: { something: "else" },
            },
          ],
        },
      ],
    };
    const raw = JSON.stringify(payload);
    const sig = await signMeta(SECRET, raw);
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/meta-ads-leadgen?tenant=tenant-a",
      method: "POST",
      rawBody: raw,
      headers: { "x-hub-signature-256": `sha256=${sig}` },
      anonymous: true,
    });
    const res = await metaLeadgenWebhook(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { processed: number };
    expect(json.processed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when no tenant is supplied (no default + no query)", async () => {
    const payload = { object: "page", entry: [] };
    const raw = JSON.stringify(payload);
    const sig = await signMeta(SECRET, raw);
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/meta-ads-leadgen",
      method: "POST",
      rawBody: raw,
      headers: { "x-hub-signature-256": `sha256=${sig}` },
      anonymous: true,
    });
    const res = await metaLeadgenWebhook(request, context);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { type: string } };
    expect(json.error.type).toBe("missing_tenant");
  });
});

// ---------------------------------------------------------------------------
// Google Ads conversion webhook
// ---------------------------------------------------------------------------

describe("webhooks/google-ads-conversion", () => {
  beforeEach(async () => {
    setEnv("GOOGLE_ADS_CONVERSION_SECRET", "shared-secret");
    await clearAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("GOOGLE_ADS_CONVERSION_SECRET");
    clearEnv("GOOGLE_ADS_OAUTH_ACCESS_TOKEN");
    clearEnv("GOOGLE_ADS_DEVELOPER_TOKEN");
    clearEnv("GOOGLE_ADS_CUSTOMER_ID");
    clearEnv("GOOGLE_ADS_CONVERSION_ACTION_ID");
  });

  it("accepts a valid bearer token and writes touchpoint + conversion", async () => {
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/google-ads-conversion?tenant=tenant-a",
      method: "POST",
      body: {
        gclid: "Cj0KCQ123",
        kind: "purchase",
        valueCents: 12345,
        occurredAt: "2024-05-01T00:00:00Z",
        campaignName: "Brand",
        source: "google",
        medium: "cpc",
        url: "https://kit.test/buy",
      },
      headers: { authorization: "Bearer shared-secret" },
      anonymous: true,
    });
    const res = await googleAdsConversionWebhook(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      visitorId: string;
      conversion: { valueCents: number };
      upload: unknown;
    };
    expect(json.upload).toBeNull();

    const visitors = await visitorRepository.list("tenant-a", { limit: 10 });
    expect(visitors.items[0].anonymousId).toBe("gclid:Cj0KCQ123");
    const touchpoints = await touchpointRepository.list("tenant-a", { limit: 10 });
    expect(touchpoints.items[0].channel).toBe("paid_search");
    expect(touchpoints.items[0].sessionId).toBe("Cj0KCQ123");
    const conversions = await conversionRepository.list("tenant-a", { limit: 10 });
    expect(conversions.items[0].valueCents).toBe(12345);
  });

  it("rejects when bearer token is missing/wrong with 401", async () => {
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/google-ads-conversion?tenant=tenant-a",
      method: "POST",
      body: { gclid: "x" },
      headers: { authorization: "Bearer wrong" },
      anonymous: true,
    });
    const res = await googleAdsConversionWebhook(request, context);
    expect(res.status).toBe(401);
    const visitors = await visitorRepository.list("tenant-a", { limit: 10 });
    expect(visitors.items).toHaveLength(0);
  });

  it("returns 400 when gclid is missing", async () => {
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/google-ads-conversion?tenant=tenant-a",
      method: "POST",
      body: { kind: "purchase" },
      headers: { authorization: "Bearer shared-secret" },
      anonymous: true,
    });
    const res = await googleAdsConversionWebhook(request, context);
    expect(res.status).toBe(400);
  });

  it("returns 400 when no tenant is supplied", async () => {
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/google-ads-conversion",
      method: "POST",
      body: { gclid: "x" },
      headers: { authorization: "Bearer shared-secret" },
      anonymous: true,
    });
    const res = await googleAdsConversionWebhook(request, context);
    expect(res.status).toBe(400);
  });

  it("uploads to Google Ads when ?upload=true and OAuth token is set", async () => {
    setEnv("GOOGLE_ADS_OAUTH_ACCESS_TOKEN", "ya29.test");
    setEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "DEV");
    setEnv("GOOGLE_ADS_CUSTOMER_ID", "555");
    setEnv("GOOGLE_ADS_CONVERSION_ACTION_ID", "999");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ partialFailureError: null, results: [{ id: "ok" }] }),
        { status: 200 },
      ),
    );

    const { context } = makeContext();
    const request = makeRequest({
      url:
        "https://kit.test/webhooks/google-ads-conversion?tenant=tenant-a&upload=true",
      method: "POST",
      body: {
        gclid: "Cj0...",
        kind: "purchase",
        valueCents: 9999,
        occurredAt: "2024-05-01T00:00:00.000Z",
      },
      headers: { authorization: "Bearer shared-secret" },
      anonymous: true,
    });
    const res = await googleAdsConversionWebhook(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { upload: { ok: boolean } | null };
    expect(json.upload?.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("uploadClickConversions");
  });

  it("reports upload failure but still returns 200 (best-effort)", async () => {
    setEnv("GOOGLE_ADS_OAUTH_ACCESS_TOKEN", "ya29.test");
    setEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "DEV");
    setEnv("GOOGLE_ADS_CUSTOMER_ID", "555");
    setEnv("GOOGLE_ADS_CONVERSION_ACTION_ID", "999");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("permission denied", { status: 403 }),
    );

    const { context } = makeContext();
    const request = makeRequest({
      url:
        "https://kit.test/webhooks/google-ads-conversion?tenant=tenant-a&upload=true",
      method: "POST",
      body: {
        gclid: "Cj0...",
        valueCents: 100,
        occurredAt: "2024-05-01T00:00:00.000Z",
      },
      headers: { authorization: "Bearer shared-secret" },
      anonymous: true,
    });
    const res = await googleAdsConversionWebhook(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      upload: { ok: boolean; error?: string } | null;
    };
    expect(json.upload?.ok).toBe(false);
    // Generic, non-stack-trace label exposed to the caller (full error is logged server-side).
    expect(json.upload?.error).toBe("upload_failed");
  });

  it("reuses existing visitor when anonymousId already exists (idempotent on gclid)", async () => {
    // Two webhook hits for the same gclid -> one visitor.
    const { context } = makeContext();
    const post = (body: Record<string, unknown>) =>
      makeRequest({
        url: "https://kit.test/webhooks/google-ads-conversion?tenant=tenant-a",
        method: "POST",
        body: { gclid: "Cj0_repeat", ...body },
        headers: { authorization: "Bearer shared-secret" },
        anonymous: true,
      });
    await googleAdsConversionWebhook(post({ valueCents: 100 }), context);
    await googleAdsConversionWebhook(post({ valueCents: 200 }), context);

    const visitors = await visitorRepository.list("tenant-a", { limit: 10 });
    expect(visitors.items).toHaveLength(1);
    const conversions = await conversionRepository.list("tenant-a", { limit: 10 });
    expect(conversions.items).toHaveLength(2);
  });
});
