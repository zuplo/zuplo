import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callClaude } from "../modules/integrations/claude.ts";
import { postSlackMessage } from "../modules/integrations/slack.ts";

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

  it("calls api.anthropic.com with x-api-key and right body shape", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_1",
          model: "claude-sonnet-4-7-20251022",
          content: [{ type: "text", text: "explanation" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 5, output_tokens: 10 },
        }),
        { status: 200 },
      ),
    );
    const result = await callClaude({
      system: "Be concise.",
      messages: [{ role: "user", content: "Why?" }],
      maxTokens: 200,
      temperature: 0.1,
    });
    expect(result.text).toBe("explanation");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("x-api-key")).toBe("sk-ant-test");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.system).toBe("Be concise.");
    expect(body.max_tokens).toBe(200);
    expect(body.temperature).toBe(0.1);
  });

  it("uses ANTHROPIC_MODEL env when provided", async () => {
    process.env.ANTHROPIC_MODEL = "claude-haiku-4-5";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_2",
          model: "claude-haiku-4-5",
          content: [{ type: "text", text: "x" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      ),
    );
    await callClaude({ messages: [{ role: "user", content: "hi" }] });
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("claude-haiku-4-5");
  });

  it("routes through AI_GATEWAY_URL when set", async () => {
    process.env.AI_GATEWAY_URL = "https://gw.example.zuplo.app";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_g",
          model: "x",
          content: [{ type: "text", text: "g" }],
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

  it("works without ANTHROPIC_API_KEY when AI_GATEWAY_URL is set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.AI_GATEWAY_URL = "https://gw.example.zuplo.app";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_g2",
          model: "x",
          content: [{ type: "text", text: "g" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      ),
    );
    await callClaude({ messages: [{ role: "user", content: "hi" }] });
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.has("x-api-key")).toBe(false);
  });

  it("throws on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      callClaude({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/Claude call failed: 500/);
  });

  it("throws when ANTHROPIC_API_KEY and AI_GATEWAY_URL are both unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_GATEWAY_URL;
    await expect(
      callClaude({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe("integrations/slack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_DEFAULT_CHANNEL;
    delete process.env.SLACK_WEBHOOK_URL;
  });

  it("uses bot-token mode when SLACK_BOT_TOKEN is set", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_DEFAULT_CHANNEL = "C123";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ts: "1.0" }), { status: 200 }),
    );
    const result = await postSlackMessage({ text: "Commission approved" });
    expect(result.ok).toBe(true);
    expect(result.ts).toBe("1.0");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer xoxb-test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.channel).toBe("C123");
  });

  it("returns error from bot-token API response", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_DEFAULT_CHANNEL = "C1";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error: "rate_limited" }),
        { status: 200 },
      ),
    );
    const result = await postSlackMessage({ text: "x" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("rate_limited");
  });

  it("uses webhook mode when only SLACK_WEBHOOK_URL is set", async () => {
    process.env.SLACK_WEBHOOK_URL =
      "https://hooks.slack.com/services/T0/B0/secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }),
    );
    const result = await postSlackMessage({ text: "Clawback alert" });
    expect(result.ok).toBe(true);
    expect(result.webhook).toBe(true);
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("hooks.slack.com");
  });

  it("webhook mode returns ok:false on non-2xx", async () => {
    process.env.SLACK_WEBHOOK_URL =
      "https://hooks.slack.com/services/T0/B0/secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 401 }),
    );
    const result = await postSlackMessage({ text: "x" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("401");
  });

  it("bot-token mode throws when channel can't be resolved", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    delete process.env.SLACK_DEFAULT_CHANNEL;
    await expect(postSlackMessage({ text: "x" })).rejects.toThrow(
      /SLACK_DEFAULT_CHANNEL/,
    );
  });

  it("throws when neither token nor webhook is set", async () => {
    await expect(postSlackMessage({ text: "x" })).rejects.toThrow(
      /Slack is not configured/,
    );
  });
});
