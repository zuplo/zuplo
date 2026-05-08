import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  clickhouseQuery,
  insertEventsRows,
  computeFunnelInClickHouse,
  escapeIdent,
  escapeString,
  escapeValue,
  eventsTableId,
  clickhouseDatabase,
} from "../modules/integrations/clickhouse.ts";
import {
  capturePostHogEvent,
  capturePostHogBatch,
  identifyPostHogPerson,
  runPostHogQuery,
} from "../modules/integrations/posthog.ts";

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
  "CLICKHOUSE_EVENTS_TABLE",
];
const PH_KEYS = [
  "POSTHOG_API_HOST",
  "POSTHOG_API_KEY",
  "POSTHOG_PERSONAL_API_KEY",
  "POSTHOG_PROJECT_ID",
];
function clearAll(keys: string[]) {
  for (const k of keys) clearEnv(k);
}

// ---------------------------------------------------------------------------
// ClickHouse — escape helpers
// ---------------------------------------------------------------------------

describe("integrations/clickhouse — escape helpers", () => {
  it("escapeString quotes and escapes backslashes/quotes", () => {
    expect(escapeString("foo")).toBe("'foo'");
    expect(escapeString("it's")).toBe("'it\\'s'");
    expect(escapeString("a\\b")).toBe("'a\\\\b'");
  });

  it("escapeIdent wraps in double quotes and escapes nested ones", () => {
    expect(escapeIdent("name")).toBe('"name"');
    expect(escapeIdent('weird"id')).toBe('"weird""id"');
  });

  it("escapeValue handles primitives, arrays, and null", () => {
    expect(escapeValue(null)).toBe("NULL");
    expect(escapeValue(undefined)).toBe("NULL");
    expect(escapeValue(42)).toBe("42");
    expect(escapeValue(true)).toBe("1");
    expect(escapeValue(false)).toBe("0");
    expect(escapeValue("x")).toBe("'x'");
    expect(escapeValue([1, "x"])).toBe("[1, 'x']");
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

  it("POSTs to the configured URL with basic auth and the right format", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud/");
    setEnv("CLICKHOUSE_USERNAME", "default");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(`{"a":1}\n{"a":2}\n`, { status: 200 }),
      );

    const result = await clickhouseQuery({ sql: "SELECT 1" });
    expect(result.rows).toEqual([{ a: 1 }, { a: 2 }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://my-ch.cloud/?default_format=JSONEachRow",
    );
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe(
      `Basic ${btoa("default:pw")}`,
    );
    expect(headers.get("content-type")).toBe("text/plain");
    expect((init as RequestInit).body).toBe("SELECT 1");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("throws on non-2xx response", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("syntax error near 'SELECT'", { status: 400 }),
    );
    await expect(clickhouseQuery({ sql: "SELECT" })).rejects.toThrow(
      /ClickHouse 400/,
    );
  });

  it("throws when CLICKHOUSE_URL is unset", async () => {
    clearEnv("CLICKHOUSE_URL");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    await expect(clickhouseQuery({ sql: "SELECT 1" })).rejects.toThrow(
      /CLICKHOUSE_URL/,
    );
  });

  it("throws when CLICKHOUSE_PASSWORD is unset", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud");
    clearEnv("CLICKHOUSE_PASSWORD");
    await expect(clickhouseQuery({ sql: "SELECT 1" })).rejects.toThrow(
      /CLICKHOUSE_PASSWORD/,
    );
  });
});

// ---------------------------------------------------------------------------
// ClickHouse — insertEventsRows
// ---------------------------------------------------------------------------

describe("integrations/clickhouse — insertEventsRows", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(CH_KEYS);
  });

  it("builds an INSERT INTO statement with all required columns", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }));

    await insertEventsRows([
      {
        id: "ev_1",
        tenantId: "t-1",
        userId: "u-1",
        name: "page_view",
        properties: { url: "/home" },
        occurredAt: "2024-01-01T00:00:00Z",
        sessionId: "s-1",
        deviceId: null,
        ip: null,
        createdAt: "2024-01-01T00:00:00Z",
      },
    ]);

    const body = String(fetchMock.mock.calls[0]![1]?.body ?? "");
    expect(body).toMatch(/^INSERT INTO/);
    expect(body).toContain('"id"');
    expect(body).toContain('"properties"');
    expect(body).toContain('\'page_view\'');
    expect(body).toContain('\'{"url":"/home"}\'');
  });

  it("no-ops on empty input (no fetch)", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }));
    await insertEventsRows([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses CLICKHOUSE_DATABASE + CLICKHOUSE_EVENTS_TABLE in the table id", () => {
    setEnv("CLICKHOUSE_DATABASE", "analytics");
    setEnv("CLICKHOUSE_EVENTS_TABLE", "events_v2");
    expect(eventsTableId()).toBe('"analytics"."events_v2"');
    expect(clickhouseDatabase()).toBe("analytics");
    clearEnv("CLICKHOUSE_DATABASE");
    clearEnv("CLICKHOUSE_EVENTS_TABLE");
    expect(eventsTableId()).toBe('"default"."events"');
  });
});

// ---------------------------------------------------------------------------
// ClickHouse — computeFunnelInClickHouse
// ---------------------------------------------------------------------------

describe("integrations/clickhouse — computeFunnelInClickHouse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(CH_KEYS);
  });

  it("returns zeroed result for empty steps without calling fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const out = await computeFunnelInClickHouse({
      tenantId: "t",
      steps: [],
      dateFrom: "2024-01-01",
      dateTo: "2024-01-02",
    });
    expect(out).toEqual({ usersConsidered: 0, steps: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aggregates windowFunnel rows into per-step counts and conversions", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    // Three steps. windowFunnel returns max-step-reached per user.
    // Stub: 50 reached step 0 (i.e. only first), 30 reached step 2 (got 2 events), 20 reached step 3 (all).
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        // ClickHouse JSONEachRow lines: { reached, users }
        `{"reached":1,"users":"50"}\n{"reached":2,"users":"30"}\n{"reached":3,"users":"20"}\n`,
        { status: 200 },
      ),
    );

    const out = await computeFunnelInClickHouse({
      tenantId: "tenant-1",
      steps: [
        { eventName: "view" },
        { eventName: "click" },
        { eventName: "purchase", filters: { plan: "pro" } },
      ],
      dateFrom: "2024-01-01T00:00:00Z",
      dateTo: "2024-01-31T23:59:59Z",
    });

    expect(out.usersConsidered).toBe(100);
    expect(out.steps[0].count).toBe(100);
    expect(out.steps[1].count).toBe(50);
    expect(out.steps[2].count).toBe(20);
    expect(out.steps[1].conversionFromPrev).toBe(0.5);
    expect(out.steps[2].conversionFromPrev).toBe(20 / 50);

    // Verify generated SQL contains the per-step expression and tenantId filter.
    const sql = String(fetchMock.mock.calls[0]![1]?.body ?? "");
    expect(sql).toContain("windowFunnel");
    expect(sql).toContain("'tenant-1'");
    expect(sql).toContain("'view'");
    expect(sql).toContain("JSONExtractString(properties, 'plan')");
  });

  it("propagates errors from clickhouseQuery", async () => {
    setEnv("CLICKHOUSE_URL", "https://my-ch.cloud");
    setEnv("CLICKHOUSE_PASSWORD", "pw");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      computeFunnelInClickHouse({
        tenantId: "t",
        steps: [{ eventName: "x" }],
        dateFrom: "2024-01-01",
        dateTo: "2024-01-02",
      }),
    ).rejects.toThrow(/ClickHouse 500/);
  });
});

// ---------------------------------------------------------------------------
// PostHog — capturePostHogEvent
// ---------------------------------------------------------------------------

describe("integrations/posthog — capturePostHogEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(PH_KEYS);
  });

  it("POSTs /capture/ with api_key and event payload", async () => {
    setEnv("POSTHOG_API_KEY", "phc_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await capturePostHogEvent({
      distinctId: "u_1",
      event: "demo",
      properties: { plan: "pro" },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://us.i.posthog.com/capture/");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.api_key).toBe("phc_test");
    expect(body.distinct_id).toBe("u_1");
    expect(body.event).toBe("demo");
    expect(body.properties.plan).toBe("pro");
  });

  it("throws on non-2xx", async () => {
    setEnv("POSTHOG_API_KEY", "phc_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      capturePostHogEvent({ distinctId: "u", event: "e" }),
    ).rejects.toThrow(/PostHog capture failed/);
  });

  it("throws when POSTHOG_API_KEY is unset", async () => {
    await expect(
      capturePostHogEvent({ distinctId: "u", event: "e" }),
    ).rejects.toThrow(/POSTHOG_API_KEY/);
  });
});

// ---------------------------------------------------------------------------
// PostHog — capturePostHogBatch + identifyPostHogPerson
// ---------------------------------------------------------------------------

describe("integrations/posthog — capturePostHogBatch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(PH_KEYS);
  });

  it("POSTs /batch/ with mapped events", async () => {
    setEnv("POSTHOG_API_KEY", "phc_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await capturePostHogBatch({
      events: [
        { distinctId: "u1", event: "a" },
        { distinctId: "u2", event: "b", properties: { x: 1 } },
      ],
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://us.i.posthog.com/batch/");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.api_key).toBe("phc_test");
    expect(body.batch).toHaveLength(2);
    expect(body.batch[0].distinct_id).toBe("u1");
    expect(body.batch[1].properties).toEqual({ x: 1 });
  });

  it("no-ops on empty events", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await capturePostHogBatch({ events: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on non-2xx", async () => {
    setEnv("POSTHOG_API_KEY", "phc_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      capturePostHogBatch({ events: [{ distinctId: "u", event: "e" }] }),
    ).rejects.toThrow(/PostHog batch failed/);
  });
});

describe("integrations/posthog — identifyPostHogPerson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(PH_KEYS);
  });

  it("posts a $identify event with $set/$set_once", async () => {
    setEnv("POSTHOG_API_KEY", "phc_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await identifyPostHogPerson({
      distinctId: "u_1",
      properties: { plan: "pro" },
      setOnce: { firstSeen: "2024-01-01" },
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.event).toBe("$identify");
    expect(body.distinct_id).toBe("u_1");
    expect(body.properties.$set).toEqual({ plan: "pro" });
    expect(body.properties.$set_once).toEqual({ firstSeen: "2024-01-01" });
  });
});

// ---------------------------------------------------------------------------
// PostHog — runPostHogQuery
// ---------------------------------------------------------------------------

describe("integrations/posthog — runPostHogQuery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAll(PH_KEYS);
  });

  it("POSTs HogQL with bearer auth + values", async () => {
    setEnv("POSTHOG_PERSONAL_API_KEY", "phx_test");
    setEnv("POSTHOG_PROJECT_ID", "42");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [["page_view", 100]],
          columns: ["event", "volume"],
        }),
        { status: 200 },
      ),
    );

    const out = await runPostHogQuery({
      hogql: "SELECT event, count() FROM events GROUP BY event",
      parameters: { foo: "bar" },
    });
    expect(out.results).toEqual([["page_view", 100]]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://us.i.posthog.com/api/projects/42/query/");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer phx_test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.query.kind).toBe("HogQLQuery");
    expect(body.query.values).toEqual({ foo: "bar" });
  });

  it("throws on non-2xx", async () => {
    setEnv("POSTHOG_PERSONAL_API_KEY", "phx_test");
    setEnv("POSTHOG_PROJECT_ID", "1");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      runPostHogQuery({ hogql: "x" }),
    ).rejects.toThrow(/PostHog query failed/);
  });

  it("throws when POSTHOG_PERSONAL_API_KEY is unset", async () => {
    setEnv("POSTHOG_PROJECT_ID", "1");
    await expect(
      runPostHogQuery({ hogql: "x" }),
    ).rejects.toThrow(/POSTHOG_PERSONAL_API_KEY/);
  });

  it("throws when POSTHOG_PROJECT_ID is unset", async () => {
    setEnv("POSTHOG_PERSONAL_API_KEY", "phx_test");
    await expect(
      runPostHogQuery({ hogql: "x" }),
    ).rejects.toThrow(/POSTHOG_PROJECT_ID/);
  });
});
