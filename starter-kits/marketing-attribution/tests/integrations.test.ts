import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  clickhouseQuery,
  insertTouchpoint,
  insertConversion,
  lastTouchByChannel,
  linearByChannel,
  explainPath,
  conversionsTableId,
  touchpointsTableId,
  database,
  escapeString,
  escapeIdent,
  escapeValue,
} from "../modules/integrations/clickhouse.ts";
import {
  fetchMetaLead,
  flattenLeadFields,
  fetchMetaInsights,
  verifyMetaSignature,
} from "../modules/integrations/meta-ads.ts";
import {
  fetchCampaignSpend,
  uploadOfflineConversion,
  verifyGoogleConversionSignature,
} from "../modules/integrations/google-ads.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

const CH_KEYS = [
  "CLICKHOUSE_URL",
  "CLICKHOUSE_USERNAME",
  "CLICKHOUSE_PASSWORD",
  "CLICKHOUSE_DATABASE",
  "CLICKHOUSE_TOUCHPOINTS_TABLE",
  "CLICKHOUSE_CONVERSIONS_TABLE",
];
const META_KEYS = [
  "META_GRAPH_VERSION",
  "META_APP_SECRET",
  "META_PAGE_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "META_VERIFY_TOKEN",
];
const GA_KEYS = [
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
  "GOOGLE_ADS_CUSTOMER_ID",
  "GOOGLE_ADS_OAUTH_ACCESS_TOKEN",
  "GOOGLE_ADS_API_VERSION",
  "GOOGLE_ADS_CONVERSION_SECRET",
  "GOOGLE_ADS_CONVERSION_ACTION_ID",
];

function clearAll(keys: string[]) {
  for (const k of keys) clearEnv(k);
}

// ---------------------------------------------------------------------------
// ClickHouse — escape helpers
// ---------------------------------------------------------------------------

describe("integrations/clickhouse — escape helpers + table ids", () => {
  afterEach(() => clearAll(CH_KEYS));

  it("escape helpers return expected forms", () => {
    expect(escapeString("a'b")).toBe("'a\\'b'");
    expect(escapeIdent("x")).toBe('"x"');
    expect(escapeValue(null)).toBe("NULL");
    expect(escapeValue(true)).toBe("1");
    expect(escapeValue(["a", "b"])).toBe("['a', 'b']");
  });

  it("table ids fall back to defaults", () => {
    expect(database()).toBe("default");
    expect(touchpointsTableId()).toBe('"default"."touchpoints"');
    expect(conversionsTableId()).toBe('"default"."conversions"');
  });

  it("table ids use env overrides", () => {
    setEnv("CLICKHOUSE_DATABASE", "marketing");
    setEnv("CLICKHOUSE_TOUCHPOINTS_TABLE", "tp_v2");
    setEnv("CLICKHOUSE_CONVERSIONS_TABLE", "conv_v2");
    expect(touchpointsTableId()).toBe('"marketing"."tp_v2"');
    expect(conversionsTableId()).toBe('"marketing"."conv_v2"');
  });
});

// ---------------------------------------------------------------------------
// ClickHouse — clickhouseQuery
// ---------------------------------------------------------------------------

describe("integrations/clickhouse — clickhouseQuery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(CH_KEYS);
  });

  it("POSTs SQL with basic auth", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud/");
    setEnv("CLICKHOUSE_USERNAME", "default");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(`{"x":1}\n`, { status: 200 }),
      );
    const out = await clickhouseQuery({ sql: "SELECT 1" });
    expect(out.rows).toEqual([{ x: 1 }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://my-ch.cloud/?default_format=JSONEachRow",
    );
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe(`Basic ${btoa("default:pw")}`);
  });

  it("throws on non-2xx", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(clickhouseQuery({ sql: "SELECT 1" })).rejects.toThrow(
      /ClickHouse 500/,
    );
  });

  it("throws when CLICKHOUSE_URL is unset", async () => {
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    await expect(clickhouseQuery({ sql: "x" })).rejects.toThrow(
      /CLICKHOUSE_URL/,
    );
  });
});

// ---------------------------------------------------------------------------
// ClickHouse — insertTouchpoint / insertConversion
// ---------------------------------------------------------------------------

describe("integrations/clickhouse — insert helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(CH_KEYS);
  });

  it("insertTouchpoint sends an INSERT INTO statement with all columns", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }));

    await insertTouchpoint({
      id: "tp_1",
      tenantId: "t",
      visitorId: "v",
      channel: "social",
      campaignName: "Spring Sale",
      source: "meta",
      medium: "lead_ad",
      occurredAt: "2024-01-01T00:00:00Z",
      url: "https://kit.test/x",
      sessionId: "sess",
    });
    const body = String(fetchMock.mock.calls[0]![1]?.body ?? "");
    expect(body).toContain("INSERT INTO");
    expect(body).toContain('"channel"');
    expect(body).toContain("'social'");
    expect(body).toContain("'meta'");
    expect(body).toContain("'lead_ad'");
  });

  it("insertConversion sends an INSERT INTO with valueCents", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }));

    await insertConversion({
      id: "c_1",
      tenantId: "t",
      visitorId: "v",
      kind: "purchase",
      valueCents: 12345,
      occurredAt: "2024-01-01T00:00:00Z",
      dealId: null,
    });
    const body = String(fetchMock.mock.calls[0]![1]?.body ?? "");
    expect(body).toContain("12345");
    expect(body).toContain("'purchase'");
    expect(body).toContain("NULL");
  });
});

// ---------------------------------------------------------------------------
// ClickHouse — attribution queries
// ---------------------------------------------------------------------------

describe("integrations/clickhouse — lastTouchByChannel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(CH_KEYS);
  });

  it("parses ChannelRow rows from JSONEachRow", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `{"channel":"paid_search","attributedCents":"1000","conversions":"5"}\n` +
          `{"channel":"organic","attributedCents":"500","conversions":"3"}\n`,
        { status: 200 },
      ),
    );
    const out = await lastTouchByChannel({
      tenantId: "t",
      dateFrom: "2024-01-01",
      dateTo: "2024-01-31",
    });
    expect(out).toEqual([
      { channel: "paid_search", attributedCents: 1000, conversions: 5 },
      { channel: "organic", attributedCents: 500, conversions: 3 },
    ]);
    const sql = String(fetchMock.mock.calls[0]![1]?.body ?? "");
    expect(sql).toContain("argMax");
    expect(sql).toContain("'t'");
  });

  it("throws when ClickHouse fails", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      lastTouchByChannel({ tenantId: "t", dateFrom: "x", dateTo: "y" }),
    ).rejects.toThrow(/ClickHouse 500/);
  });

  it("throws when CLICKHOUSE_URL is unset", async () => {
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    await expect(
      lastTouchByChannel({ tenantId: "t", dateFrom: "x", dateTo: "y" }),
    ).rejects.toThrow(/CLICKHOUSE_URL/);
  });
});

describe("integrations/clickhouse — linearByChannel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(CH_KEYS);
  });

  it("parses linear-attribution rows correctly", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `{"channel":"social","attributedCents":"333","conversions":"3"}\n`,
        { status: 200 },
      ),
    );
    const out = await linearByChannel({
      tenantId: "t",
      dateFrom: "x",
      dateTo: "y",
    });
    expect(out).toEqual([{ channel: "social", attributedCents: 333, conversions: 3 }]);
  });
});

describe("integrations/clickhouse — explainPath", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(CH_KEYS);
  });

  it("returns null when there are no conversions for the visitor", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
    const out = await explainPath({ tenantId: "t", visitorId: "v" });
    expect(out).toBeNull();
  });

  it("walks conversion + touchpoint queries and returns the path", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      // First call: conversion lookup.
      .mockResolvedValueOnce(
        new Response(
          `{"id":"c1","valueCents":"12345","occurredAt":"2024-01-10"}\n`,
          { status: 200 },
        ),
      )
      // Second call: touchpoints.
      .mockResolvedValueOnce(
        new Response(
          `{"id":"tp1","channel":"social","campaignName":"a","source":"meta","medium":"lead_ad","occurredAt":"2024-01-09","url":"u1"}\n` +
            `{"id":"tp2","channel":"paid_search","campaignName":"b","source":"google","medium":"cpc","occurredAt":"2024-01-10","url":"u2"}\n`,
          { status: 200 },
        ),
      );
    const out = await explainPath({ tenantId: "t", visitorId: "v" });
    expect(out?.conversionId).toBe("c1");
    expect(out?.conversionValueCents).toBe(12345);
    expect(out?.touchpoints).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Meta Ads
// ---------------------------------------------------------------------------

describe("integrations/meta-ads — fetchMetaLead", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(META_KEYS);
  });

  it("GETs /:leadId from the Graph API with the page access token", async () => {
    setEnv("META_PAGE_ACCESS_TOKEN", "PAGE-TOKEN");
    const lead = {
      id: "lead_1",
      created_time: "2024-01-01T00:00:00Z",
      ad_id: "ad_1",
      campaign_name: "Spring Sale",
      form_id: "f1",
      field_data: [{ name: "email", values: ["x@y.com"] }],
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(lead), { status: 200 }));
    const out = await fetchMetaLead("lead_1");
    expect(out.id).toBe("lead_1");
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("https://graph.facebook.com/v19.0/lead_1");
    expect(url).toContain("access_token=PAGE-TOKEN");
    expect(url).toContain("fields=id");
  });

  it("uses META_GRAPH_VERSION when set", async () => {
    setEnv("META_PAGE_ACCESS_TOKEN", "T");
    setEnv("META_GRAPH_VERSION", "v20.0");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "lead_1", field_data: [], created_time: "x" }), {
          status: 200,
        }),
      );
    await fetchMetaLead("lead_1");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/v20.0/");
  });

  it("throws on non-2xx", async () => {
    setEnv("META_PAGE_ACCESS_TOKEN", "T");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(fetchMetaLead("lead_1")).rejects.toThrow(/Meta fetchLead/);
  });

  it("throws when META_PAGE_ACCESS_TOKEN is unset", async () => {
    await expect(fetchMetaLead("lead_1")).rejects.toThrow(
      /META_PAGE_ACCESS_TOKEN/,
    );
  });
});

describe("integrations/meta-ads — flattenLeadFields", () => {
  it("flattens field_data into a flat record", () => {
    const lead = {
      id: "x",
      created_time: "x",
      field_data: [
        { name: "email", values: ["x@y.com"] },
        { name: "company", values: ["Acme"] },
        { name: "empty", values: [] },
      ],
    };
    const out = flattenLeadFields(lead as never);
    expect(out.email).toBe("x@y.com");
    expect(out.company).toBe("Acme");
    expect(out.empty).toBe("");
  });
});

describe("integrations/meta-ads — fetchMetaInsights", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(META_KEYS);
  });

  it("GETs /act_xxx/insights with mapped fields and returns parsed rows", async () => {
    setEnv("META_PAGE_ACCESS_TOKEN", "T");
    setEnv("META_AD_ACCOUNT_ID", "act_123");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              campaign_id: "c1",
              campaign_name: "Sale",
              spend: "12.34",
              impressions: "1000",
              clicks: "50",
              date_start: "2024-01-01",
              date_stop: "2024-01-01",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const out = await fetchMetaInsights({ windowDays: 7, level: "campaign" });
    expect(out).toHaveLength(1);
    expect(out[0].spendCents).toBe(1234);
    expect(out[0].impressions).toBe(1000);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/v19.0/act_123/insights");
    expect(url).toContain("level=campaign");
  });

  it("throws on non-2xx", async () => {
    setEnv("META_PAGE_ACCESS_TOKEN", "T");
    setEnv("META_AD_ACCOUNT_ID", "act_123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(fetchMetaInsights({})).rejects.toThrow(/Meta \/insights/);
  });

  it("throws when META_PAGE_ACCESS_TOKEN is unset", async () => {
    setEnv("META_AD_ACCOUNT_ID", "act_123");
    await expect(fetchMetaInsights({})).rejects.toThrow(
      /META_PAGE_ACCESS_TOKEN/,
    );
  });

  it("throws when META_AD_ACCOUNT_ID is unset", async () => {
    setEnv("META_PAGE_ACCESS_TOKEN", "T");
    await expect(fetchMetaInsights({})).rejects.toThrow(
      /META_AD_ACCOUNT_ID/,
    );
  });
});

describe("integrations/meta-ads — verifyMetaSignature", () => {
  afterEach(() => clearAll(META_KEYS));

  async function sign(secret: string, body: string) {
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

  it("returns true for a valid signature", async () => {
    setEnv("META_APP_SECRET", "shh");
    const body = JSON.stringify({ object: "page", entry: [] });
    const hex = await sign("shh", body);
    const headers = new Headers({ "x-hub-signature-256": `sha256=${hex}` });
    expect(await verifyMetaSignature({ rawBody: body, headers })).toBe(true);
  });

  it("returns false on tampered body", async () => {
    setEnv("META_APP_SECRET", "shh");
    const hex = await sign("shh", '{"a":1}');
    const headers = new Headers({ "x-hub-signature-256": `sha256=${hex}` });
    expect(
      await verifyMetaSignature({ rawBody: '{"a":2}', headers }),
    ).toBe(false);
  });

  it("returns false when header is missing", async () => {
    setEnv("META_APP_SECRET", "shh");
    expect(
      await verifyMetaSignature({
        rawBody: "{}",
        headers: new Headers(),
      }),
    ).toBe(false);
  });

  it("returns false when META_APP_SECRET is unset", async () => {
    expect(
      await verifyMetaSignature({
        rawBody: "{}",
        headers: new Headers({ "x-hub-signature-256": "sha256=deadbeef" }),
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Google Ads
// ---------------------------------------------------------------------------

describe("integrations/google-ads — fetchCampaignSpend", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(GA_KEYS);
  });

  it("POSTs a GAQL searchStream and parses cost_micros into cents", async () => {
    setEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "DEV");
    setEnv("GOOGLE_ADS_CUSTOMER_ID", "111-222-3333");
    setEnv("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "999-888-7777");
    setEnv("GOOGLE_ADS_OAUTH_ACCESS_TOKEN", "ya29.test");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            results: [
              {
                campaign: { id: "c1", name: "Brand" },
                segments: { date: "2024-01-01" },
                metrics: { costMicros: "12340000", impressions: "1000", clicks: "50" },
              },
            ],
          },
        ]),
        { status: 200 },
      ),
    );

    const out = await fetchCampaignSpend({ windowDays: 7 });
    expect(out).toHaveLength(1);
    // 12,340,000 micros = 1,234 cents (12.34 dollars)
    expect(out[0].spendCents).toBe(1234);
    expect(out[0].campaignId).toBe("c1");
    expect(out[0].clicks).toBe(50);

    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain(
      "/v17/customers/1112223333/googleAds:searchStream",
    );
    const headers = new Headers(
      (fetchMock.mock.calls[0]![1] as RequestInit).headers,
    );
    expect(headers.get("authorization")).toBe("Bearer ya29.test");
    expect(headers.get("developer-token")).toBe("DEV");
    expect(headers.get("login-customer-id")).toBe("9998887777");
  });

  it("throws on non-2xx", async () => {
    setEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "DEV");
    setEnv("GOOGLE_ADS_CUSTOMER_ID", "1");
    setEnv("GOOGLE_ADS_OAUTH_ACCESS_TOKEN", "ya29.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(fetchCampaignSpend({})).rejects.toThrow(
      /Google Ads searchStream/,
    );
  });

  it("throws when GOOGLE_ADS_DEVELOPER_TOKEN is unset", async () => {
    setEnv("GOOGLE_ADS_CUSTOMER_ID", "1");
    setEnv("GOOGLE_ADS_OAUTH_ACCESS_TOKEN", "ya29.test");
    await expect(fetchCampaignSpend({})).rejects.toThrow(
      /GOOGLE_ADS_DEVELOPER_TOKEN/,
    );
  });
});

describe("integrations/google-ads — uploadOfflineConversion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(GA_KEYS);
  });

  it("POSTs uploadClickConversions with the gclid + value", async () => {
    setEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "DEV");
    setEnv("GOOGLE_ADS_CUSTOMER_ID", "555");
    setEnv("GOOGLE_ADS_OAUTH_ACCESS_TOKEN", "ya29.test");
    setEnv("GOOGLE_ADS_CONVERSION_ACTION_ID", "999");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ partialFailureError: null, results: [{ id: "ok" }] }),
        { status: 200 },
      ),
    );

    const out = await uploadOfflineConversion({
      gclid: "Cj0...test",
      conversionDateTime: "2024-01-01 12:00:00+00:00",
      conversionValue: 99.95,
      currencyCode: "USD",
    });
    expect(out.results).toEqual([{ id: "ok" }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/customers/555:uploadClickConversions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.conversions[0].gclid).toBe("Cj0...test");
    expect(body.conversions[0].conversionAction).toBe(
      "customers/555/conversionActions/999",
    );
    expect(body.conversions[0].conversionValue).toBe(99.95);
    expect(body.partialFailure).toBe(true);
  });

  it("uses an explicit conversionAction when passed", async () => {
    setEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "DEV");
    setEnv("GOOGLE_ADS_CUSTOMER_ID", "555");
    setEnv("GOOGLE_ADS_OAUTH_ACCESS_TOKEN", "ya29.test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ partialFailureError: null, results: [] }), {
        status: 200,
      }),
    );
    await uploadOfflineConversion({
      gclid: "Cj0...test",
      conversionAction: "customers/555/conversionActions/777",
      conversionDateTime: "2024-01-01 12:00:00+00:00",
      conversionValue: 1,
      currencyCode: "USD",
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.conversions[0].conversionAction).toBe(
      "customers/555/conversionActions/777",
    );
  });

  it("throws when neither conversionAction nor GOOGLE_ADS_CONVERSION_ACTION_ID is set", async () => {
    setEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "DEV");
    setEnv("GOOGLE_ADS_CUSTOMER_ID", "555");
    setEnv("GOOGLE_ADS_OAUTH_ACCESS_TOKEN", "ya29.test");
    await expect(
      uploadOfflineConversion({
        gclid: "x",
        conversionDateTime: "x",
        conversionValue: 1,
        currencyCode: "USD",
      }),
    ).rejects.toThrow(/GOOGLE_ADS_CONVERSION_ACTION_ID/);
  });

  it("throws on non-2xx", async () => {
    setEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "DEV");
    setEnv("GOOGLE_ADS_CUSTOMER_ID", "555");
    setEnv("GOOGLE_ADS_OAUTH_ACCESS_TOKEN", "ya29.test");
    setEnv("GOOGLE_ADS_CONVERSION_ACTION_ID", "999");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 400 }),
    );
    await expect(
      uploadOfflineConversion({
        gclid: "x",
        conversionDateTime: "x",
        conversionValue: 1,
        currencyCode: "USD",
      }),
    ).rejects.toThrow(/Google Ads upload/);
  });
});

describe("integrations/google-ads — verifyGoogleConversionSignature", () => {
  afterEach(() => clearAll(GA_KEYS));

  it("returns true for matching bearer token", () => {
    setEnv("GOOGLE_ADS_CONVERSION_SECRET", "S3CR3T");
    const headers = new Headers({ authorization: "Bearer S3CR3T" });
    expect(verifyGoogleConversionSignature(headers)).toBe(true);
  });

  it("returns false for mismatched bearer token", () => {
    setEnv("GOOGLE_ADS_CONVERSION_SECRET", "S3CR3T");
    const headers = new Headers({ authorization: "Bearer wrong" });
    expect(verifyGoogleConversionSignature(headers)).toBe(false);
  });

  it("returns false when authorization header is missing", () => {
    setEnv("GOOGLE_ADS_CONVERSION_SECRET", "S3CR3T");
    expect(verifyGoogleConversionSignature(new Headers())).toBe(false);
  });

  it("returns false when GOOGLE_ADS_CONVERSION_SECRET is unset", () => {
    const headers = new Headers({ authorization: "Bearer x" });
    expect(verifyGoogleConversionSignature(headers)).toBe(false);
  });
});
