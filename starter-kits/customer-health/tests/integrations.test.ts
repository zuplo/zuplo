import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callClaude, parseClaudeJson } from "../modules/integrations/claude.ts";
import {
  capturePostHogEvent,
  queryPostHogHogql,
} from "../modules/integrations/posthog.ts";
import {
  getStripeRevenueHealth,
  listStripeInvoices,
  listStripeSubscriptions,
} from "../modules/integrations/stripe.ts";

describe("integrations/claude", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_GATEWAY_URL;
    delete process.env.ANTHROPIC_MODEL;
  });

  it("calls api.anthropic.com with x-api-key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg",
          model: "x",
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 2 },
        }),
        { status: 200 },
      ),
    );
    const res = await callClaude({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.text).toBe("ok");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("x-api-key")).toBe("sk-ant-test");
  });

  it("uses AI_GATEWAY_URL when set", async () => {
    process.env.AI_GATEWAY_URL = "https://gw.example.zuplo.app";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "x",
          model: "x",
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      ),
    );
    await callClaude({ messages: [{ role: "user", content: "hi" }] });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://gw.example.zuplo.app/v1/messages");
  });

  it("throws on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      callClaude({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/Claude call failed: 500/);
  });

  it("throws when ANTHROPIC_API_KEY and AI_GATEWAY_URL are unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_GATEWAY_URL;
    await expect(
      callClaude({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it("parseClaudeJson handles ```json fences", () => {
    const raw = '```json\n[{"a":1}]\n```';
    expect(parseClaudeJson(raw)).toEqual([{ a: 1 }]);
  });

  it("parseClaudeJson extracts {} block from prose", () => {
    const raw = 'Sure! Here is the result: {"hello":"world"} — let me know!';
    expect(parseClaudeJson<{ hello: string }>(raw).hello).toBe("world");
  });

  it("parseClaudeJson extracts [] block from prose", () => {
    const raw = "Some prose [1,2,3] more prose";
    expect(parseClaudeJson(raw)).toEqual([1, 2, 3]);
  });
});

describe("integrations/posthog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.POSTHOG_HOST;
    delete process.env.POSTHOG_PROJECT_API_KEY;
    delete process.env.POSTHOG_PERSONAL_API_KEY;
    delete process.env.POSTHOG_PROJECT_ID;
  });

  it("capturePostHogEvent POSTs to /capture/ with project key in body", async () => {
    process.env.POSTHOG_PROJECT_API_KEY = "phc_test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }));
    await capturePostHogEvent({
      event: "health_recalculated",
      distinctId: "tenant-a:account-1",
      properties: { tier: "yellow" },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://us.i.posthog.com/capture/");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.api_key).toBe("phc_test");
    expect(body.event).toBe("health_recalculated");
    expect(body.distinct_id).toBe("tenant-a:account-1");
    expect(body.properties.tier).toBe("yellow");
  });

  it("capturePostHogEvent uses custom POSTHOG_HOST when set", async () => {
    process.env.POSTHOG_PROJECT_API_KEY = "phc_test";
    process.env.POSTHOG_HOST = "https://eu.i.posthog.com";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }));
    await capturePostHogEvent({
      event: "x",
      distinctId: "y",
    });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://eu.i.posthog.com/capture/",
    );
  });

  it("capturePostHogEvent throws on non-2xx", async () => {
    process.env.POSTHOG_PROJECT_API_KEY = "phc_test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 400 }),
    );
    await expect(
      capturePostHogEvent({ event: "x", distinctId: "y" }),
    ).rejects.toThrow(/PostHog capture failed: 400/);
  });

  it("capturePostHogEvent throws when POSTHOG_PROJECT_API_KEY unset", async () => {
    await expect(
      capturePostHogEvent({ event: "x", distinctId: "y" }),
    ).rejects.toThrow(/POSTHOG_PROJECT_API_KEY/);
  });

  it("queryPostHogHogql POSTs HogQL to project query endpoint", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test";
    process.env.POSTHOG_PROJECT_ID = "12345";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [["acme", 5]],
          columns: ["prefix", "wau"],
          hogql: "SELECT 1",
        }),
        { status: 200 },
      ),
    );
    const result = await queryPostHogHogql("SELECT 1");
    expect(result.results).toEqual([["acme", 5]]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://us.i.posthog.com/api/projects/12345/query/",
    );
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer phx_test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.query.kind).toBe("HogQLQuery");
    expect(body.query.query).toBe("SELECT 1");
  });

  it("queryPostHogHogql throws when POSTHOG_PERSONAL_API_KEY unset", async () => {
    process.env.POSTHOG_PROJECT_ID = "12345";
    await expect(queryPostHogHogql("SELECT 1")).rejects.toThrow(
      /POSTHOG_PERSONAL_API_KEY/,
    );
  });

  it("queryPostHogHogql throws when POSTHOG_PROJECT_ID unset", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test";
    await expect(queryPostHogHogql("SELECT 1")).rejects.toThrow(
      /POSTHOG_PROJECT_ID/,
    );
  });

  it("queryPostHogHogql throws on non-2xx", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test";
    process.env.POSTHOG_PROJECT_ID = "12345";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    await expect(queryPostHogHogql("SELECT 1")).rejects.toThrow(
      /PostHog query failed: 403/,
    );
  });
});

describe("integrations/stripe", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("listStripeInvoices GETs /invoices?customer with bearer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "in_1",
              status: "paid",
              amount_due: 1000,
              amount_paid: 1000,
              currency: "usd",
              due_date: null,
              paid: true,
              customer: "cus_1",
              created: 1234,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const invoices = await listStripeInvoices("cus_1");
    expect(invoices).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://api.stripe.com/v1/invoices?");
    expect(String(url)).toContain("customer=cus_1");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer sk_test_x");
  });

  it("listStripeInvoices throws on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 401 }),
    );
    await expect(listStripeInvoices("cus_1")).rejects.toThrow(
      /Stripe invoices list failed: 401/,
    );
  });

  it("listStripeSubscriptions GETs /subscriptions?customer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    await listStripeSubscriptions("cus_1");
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://api.stripe.com/v1/subscriptions?");
    expect(String(url)).toContain("customer=cus_1");
    expect(String(url)).toContain("status=all");
  });

  it("getStripeRevenueHealth aggregates invoices + subscriptions", async () => {
    const yesterday = Math.floor((Date.now() - 86_400_000) / 1000);
    const tomorrow = Math.floor((Date.now() + 86_400_000) / 1000);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/invoices")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "in_paid",
                status: "paid",
                amount_due: 1000,
                amount_paid: 1000,
                currency: "usd",
                due_date: null,
                paid: true,
                customer: "cus_1",
                created: 1,
              },
              {
                id: "in_overdue",
                status: "open",
                amount_due: 2000,
                amount_paid: 0,
                currency: "usd",
                due_date: yesterday,
                paid: false,
                customer: "cus_1",
                created: 2,
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/subscriptions")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "sub_1",
                status: "active",
                current_period_end: tomorrow,
                cancel_at_period_end: true,
                canceled_at: null,
                customer: "cus_1",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const health = await getStripeRevenueHealth("cus_1");
    expect(health.totalInvoices).toBe(2);
    expect(health.paidInvoices).toBe(1);
    expect(health.unpaidInvoices).toBe(1);
    expect(health.pastDueInvoices).toBe(1);
    expect(health.outstandingAmountCents).toBe(2000);
    expect(health.hasActiveSubscription).toBe(true);
    expect(health.hasCancellingSubscription).toBe(true);
    expect(health.nextRenewalAt).toBeTruthy();
  });

  it("listStripeInvoices throws when STRIPE_SECRET_KEY unset", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(listStripeInvoices("cus_1")).rejects.toThrow(
      /STRIPE_SECRET_KEY/,
    );
  });
});
