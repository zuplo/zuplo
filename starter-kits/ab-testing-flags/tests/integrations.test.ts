import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  capturePostHogEvent,
  decidePostHogFlags,
  runPostHogQuery,
  upsertPostHogFlag,
} from "../modules/integrations/posthog.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

const POSTHOG_ENV_KEYS = [
  "POSTHOG_API_HOST",
  "POSTHOG_API_KEY",
  "POSTHOG_PERSONAL_API_KEY",
  "POSTHOG_PROJECT_ID",
];

function clearPostHogEnv() {
  for (const k of POSTHOG_ENV_KEYS) clearEnv(k);
}

// ---------------------------------------------------------------------------
// capturePostHogEvent
// ---------------------------------------------------------------------------

describe("integrations/posthog — capturePostHogEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearPostHogEnv();
  });

  it("POSTs to /capture/ with api_key + event payload", async () => {
    setEnv("POSTHOG_API_KEY", "phc_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await capturePostHogEvent({
      distinctId: "u_1",
      event: "trial_started",
      properties: { plan: "pro" },
      groups: { company: "acme" },
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://us.i.posthog.com/capture/");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.api_key).toBe("phc_test");
    expect(body.event).toBe("trial_started");
    expect(body.distinct_id).toBe("u_1");
    expect(body.properties.plan).toBe("pro");
    expect(body.properties.$groups).toEqual({ company: "acme" });
    expect(typeof body.timestamp).toBe("string");
  });

  it("uses POSTHOG_API_HOST when set", async () => {
    setEnv("POSTHOG_API_KEY", "phc_test");
    setEnv("POSTHOG_API_HOST", "https://eu.i.posthog.com/");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await capturePostHogEvent({ distinctId: "u_2", event: "x" });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://eu.i.posthog.com/capture/",
    );
  });

  it("throws on non-2xx", async () => {
    setEnv("POSTHOG_API_KEY", "phc_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limit", { status: 429 }),
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
// decidePostHogFlags
// ---------------------------------------------------------------------------

describe("integrations/posthog — decidePostHogFlags", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearPostHogEnv();
  });

  it("POSTs to /decide/?v=3 and returns mapped feature flags", async () => {
    setEnv("POSTHOG_API_KEY", "phc_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            featureFlags: { my_flag: "variant_a" },
            featureFlagPayloads: { my_flag: { foo: "bar" } },
          }),
          { status: 200 },
        ),
      );

    const result = await decidePostHogFlags({
      distinctId: "u_1",
      groups: { company: "acme" },
      personProperties: { plan: "pro" },
    });
    expect(result.featureFlags.my_flag).toBe("variant_a");
    expect(result.featureFlagPayloads?.my_flag).toEqual({ foo: "bar" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://us.i.posthog.com/decide/?v=3");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.api_key).toBe("phc_test");
    expect(body.distinct_id).toBe("u_1");
    expect(body.groups).toEqual({ company: "acme" });
    expect(body.person_properties).toEqual({ plan: "pro" });
  });

  it("throws on non-2xx", async () => {
    setEnv("POSTHOG_API_KEY", "phc_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    await expect(
      decidePostHogFlags({ distinctId: "u" }),
    ).rejects.toThrow(/PostHog decide failed/);
  });

  it("throws when POSTHOG_API_KEY is unset", async () => {
    await expect(
      decidePostHogFlags({ distinctId: "u" }),
    ).rejects.toThrow(/POSTHOG_API_KEY/);
  });
});

// ---------------------------------------------------------------------------
// runPostHogQuery (HogQL)
// ---------------------------------------------------------------------------

describe("integrations/posthog — runPostHogQuery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearPostHogEnv();
  });

  it("POSTs HogQL to /api/projects/:id/query/ with bearer auth", async () => {
    setEnv("POSTHOG_PERSONAL_API_KEY", "phx_test");
    setEnv("POSTHOG_PROJECT_ID", "1234");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [["a", 1]],
            columns: ["variant", "users"],
            types: ["String", "UInt64"],
            hogql: "SELECT 1",
          }),
          { status: 200 },
        ),
      );

    const result = await runPostHogQuery({
      hogql: "SELECT count() FROM events",
      parameters: { foo: "bar" },
    });
    expect(result.results).toEqual([["a", 1]]);
    expect(result.columns).toEqual(["variant", "users"]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://us.i.posthog.com/api/projects/1234/query/");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer phx_test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.query.kind).toBe("HogQLQuery");
    expect(body.query.query).toBe("SELECT count() FROM events");
    expect(body.query.values).toEqual({ foo: "bar" });
  });

  it("throws on non-2xx", async () => {
    setEnv("POSTHOG_PERSONAL_API_KEY", "phx_test");
    setEnv("POSTHOG_PROJECT_ID", "1234");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    await expect(
      runPostHogQuery({ hogql: "SELECT 1" }),
    ).rejects.toThrow(/PostHog query failed/);
  });

  it("throws when POSTHOG_PERSONAL_API_KEY is unset", async () => {
    setEnv("POSTHOG_PROJECT_ID", "1234");
    await expect(
      runPostHogQuery({ hogql: "SELECT 1" }),
    ).rejects.toThrow(/POSTHOG_PERSONAL_API_KEY/);
  });

  it("throws when POSTHOG_PROJECT_ID is unset", async () => {
    setEnv("POSTHOG_PERSONAL_API_KEY", "phx_test");
    await expect(
      runPostHogQuery({ hogql: "SELECT 1" }),
    ).rejects.toThrow(/POSTHOG_PROJECT_ID/);
  });
});

// ---------------------------------------------------------------------------
// upsertPostHogFlag
// ---------------------------------------------------------------------------

describe("integrations/posthog — upsertPostHogFlag", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearPostHogEnv();
  });

  it("creates a new flag when search returns empty", async () => {
    setEnv("POSTHOG_PERSONAL_API_KEY", "phx_test");
    setEnv("POSTHOG_PROJECT_ID", "9");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 42, key: "my_flag" }), {
          status: 200,
        }),
      );

    const out = await upsertPostHogFlag({
      key: "my_flag",
      name: "My Flag",
      variants: [
        { key: "control", rolloutPercentage: 50 },
        { key: "treatment", rolloutPercentage: 50 },
      ],
    });
    expect(out).toEqual({ id: 42, key: "my_flag" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [searchUrl] = fetchMock.mock.calls[0]!;
    expect(String(searchUrl)).toContain("?search=my_flag");
    const [createUrl, createInit] = fetchMock.mock.calls[1]!;
    expect(String(createUrl)).toBe(
      "https://us.i.posthog.com/api/projects/9/feature_flags/",
    );
    expect((createInit as RequestInit).method).toBe("POST");
    const body = JSON.parse((createInit as RequestInit).body as string);
    expect(body.key).toBe("my_flag");
    expect(body.filters.multivariate.variants[0].key).toBe("control");
  });

  it("PATCHes when an existing flag with that key is found", async () => {
    setEnv("POSTHOG_PERSONAL_API_KEY", "phx_test");
    setEnv("POSTHOG_PROJECT_ID", "9");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ results: [{ id: 7, key: "existing" }] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 7, key: "existing" }), {
          status: 200,
        }),
      );

    await upsertPostHogFlag({
      key: "existing",
      name: "x",
      variants: [{ key: "a", rolloutPercentage: 100 }],
    });
    const [updateUrl, updateInit] = fetchMock.mock.calls[1]!;
    expect(String(updateUrl)).toBe(
      "https://us.i.posthog.com/api/projects/9/feature_flags/7/",
    );
    expect((updateInit as RequestInit).method).toBe("PATCH");
  });

  it("throws when lookup fails", async () => {
    setEnv("POSTHOG_PERSONAL_API_KEY", "phx_test");
    setEnv("POSTHOG_PROJECT_ID", "9");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    await expect(
      upsertPostHogFlag({
        key: "x",
        name: "x",
        variants: [{ key: "a", rolloutPercentage: 100 }],
      }),
    ).rejects.toThrow(/PostHog flag lookup failed/);
  });
});
