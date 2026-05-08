import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { sendResendEmail } from "../modules/integrations/resend.ts";
import { postSlackMessage } from "../modules/integrations/slack.ts";
import { completeWithClaude } from "../modules/integrations/claude.ts";

/**
 * Save and restore environment values that the integrations capture from
 * `environment` (a singleton initialized from process.env at runtime stub
 * load time). Each test sets only what it needs, then restoreEnv() puts
 * everything back.
 */
const ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "SLACK_BOT_TOKEN",
  "SLACK_DEFAULT_CHANNEL",
  "SLACK_WEBHOOK_URL",
  "ANTHROPIC_API_KEY",
  "AI_GATEWAY_URL",
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) snap[k] = (environment as Record<string, string | undefined>)[k];
  return snap;
}

function restoreEnv(snap: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete (environment as Record<string, string | undefined>)[k];
    else (environment as Record<string, string | undefined>)[k] = snap[k];
  }
}

function clearEnv() {
  for (const k of ENV_KEYS) delete (environment as Record<string, string | undefined>)[k];
}

describe("integrations/resend", () => {
  let snap: Record<string, string | undefined>;
  beforeEach(() => {
    snap = snapshotEnv();
    clearEnv();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv(snap);
  });

  it("POSTs to /emails with bearer auth and JSON body", async () => {
    (environment as Record<string, string | undefined>).RESEND_API_KEY = "re_test_key";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "msg_123" }), { status: 200 }));

    const result = await sendResendEmail({
      to: "to@example.com",
      from: "from@example.com",
      subject: "hi",
      text: "hello",
    });

    expect(result.id).toBe("msg_123");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const requestInit = init as RequestInit;
    expect(requestInit.method).toBe("POST");
    const headers = new Headers(requestInit.headers);
    expect(headers.get("authorization")).toBe("Bearer re_test_key");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse(requestInit.body as string);
    expect(body.to).toBe("to@example.com");
    expect(body.from).toBe("from@example.com");
    expect(body.subject).toBe("hi");
    expect(body.text).toBe("hello");
  });

  it("uses RESEND_FROM_EMAIL fallback when from is omitted", async () => {
    (environment as Record<string, string | undefined>).RESEND_API_KEY = "re_test_key";
    (environment as Record<string, string | undefined>).RESEND_FROM_EMAIL = "default@kit.test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "x" }), { status: 200 }));

    await sendResendEmail({ to: "to@example.com", subject: "hi", text: "hi" });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.from).toBe("default@kit.test");
  });

  it("throws on non-2xx response", async () => {
    (environment as Record<string, string | undefined>).RESEND_API_KEY = "re_test_key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Forbidden", { status: 403 }),
    );
    await expect(
      sendResendEmail({ to: "x", from: "y", subject: "z", text: "w" }),
    ).rejects.toThrow(/403/);
  });

  it("throws when RESEND_API_KEY is unset", async () => {
    await expect(
      sendResendEmail({ to: "x", from: "y", subject: "z", text: "w" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});

describe("integrations/slack", () => {
  let snap: Record<string, string | undefined>;
  beforeEach(() => {
    snap = snapshotEnv();
    clearEnv();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv(snap);
  });

  it("posts via Web API when SLACK_BOT_TOKEN is set", async () => {
    (environment as Record<string, string | undefined>).SLACK_BOT_TOKEN = "xoxb-test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, channel: "C0", ts: "12345.678" }), {
        status: 200,
      }),
    );

    const result = await postSlackMessage({ channel: "#general", text: "hello" });

    expect(result.ok).toBe(true);
    expect(result.ts).toBe("12345.678");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const requestInit = init as RequestInit;
    expect(requestInit.method).toBe("POST");
    const headers = new Headers(requestInit.headers);
    expect(headers.get("authorization")).toBe("Bearer xoxb-test");
    const body = JSON.parse(requestInit.body as string);
    expect(body.channel).toBe("#general");
    expect(body.text).toBe("hello");
  });

  it("falls back to webhook URL when no bot token", async () => {
    (environment as Record<string, string | undefined>).SLACK_WEBHOOK_URL =
      "https://hooks.slack.com/services/T1/B1/abcdef";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const result = await postSlackMessage({ text: "hi" });

    expect(result.ok).toBe(true);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://hooks.slack.com/services/T1/B1/abcdef");
  });

  it("throws when Web API returns ok=false", async () => {
    (environment as Record<string, string | undefined>).SLACK_BOT_TOKEN = "xoxb-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), {
        status: 200,
      }),
    );
    await expect(
      postSlackMessage({ channel: "#nope", text: "hi" }),
    ).rejects.toThrow(/channel_not_found/);
  });

  it("throws on webhook non-2xx", async () => {
    (environment as Record<string, string | undefined>).SLACK_WEBHOOK_URL =
      "https://hooks.slack.com/services/T1/B1/abcdef";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(postSlackMessage({ text: "x" })).rejects.toThrow(/500/);
  });

  it("throws when no Slack credentials are set", async () => {
    await expect(postSlackMessage({ text: "x" })).rejects.toThrow(
      /No Slack credentials/,
    );
  });

  it("throws when bot token is set but no channel can be resolved", async () => {
    (environment as Record<string, string | undefined>).SLACK_BOT_TOKEN = "xoxb-test";
    await expect(postSlackMessage({ text: "no channel" })).rejects.toThrow(
      /channel required/,
    );
  });
});

describe("integrations/claude", () => {
  let snap: Record<string, string | undefined>;
  beforeEach(() => {
    snap = snapshotEnv();
    clearEnv();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv(snap);
  });

  function fakeAnthropicResponse() {
    return new Response(
      JSON.stringify({
        id: "msg_01",
        model: "claude-sonnet-4-7-20251022",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "hi there" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  it("POSTs to api.anthropic.com with correct headers and parses content blocks", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeAnthropicResponse());

    const result = await completeWithClaude({
      messages: [{ role: "user", content: "hello" }],
      maxTokens: 256,
      temperature: 0.2,
      system: "you are helpful",
    });

    expect(result.text).toBe("hi there");
    expect(result.id).toBe("msg_01");
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const requestInit = init as RequestInit;
    const headers = new Headers(requestInit.headers);
    expect(headers.get("x-api-key")).toBe("sk-ant-test");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    expect(requestInit.method).toBe("POST");
    const body = JSON.parse(requestInit.body as string);
    expect(body.system).toBe("you are helpful");
    expect(body.max_tokens).toBe(256);
    expect(body.temperature).toBe(0.2);
    expect(body.messages[0]).toEqual({ role: "user", content: "hello" });
  });

  it("routes through AI_GATEWAY_URL when set", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    (environment as Record<string, string | undefined>).AI_GATEWAY_URL =
      "https://gateway.example.com/proxy";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeAnthropicResponse());

    await completeWithClaude({
      messages: [{ role: "user", content: "hi" }],
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://gateway.example.com/proxy/v1/messages");
  });

  it("concatenates multiple text content blocks", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_02",
          model: "claude-sonnet-4-7-20251022",
          stop_reason: "end_turn",
          content: [
            { type: "text", text: "part 1 " },
            { type: "tool_use" },
            { type: "text", text: "part 2" },
          ],
          usage: { input_tokens: 1, output_tokens: 2 },
        }),
        { status: 200 },
      ),
    );

    const result = await completeWithClaude({
      messages: [{ role: "user", content: "x" }],
    });

    expect(result.text).toBe("part 1 part 2");
  });

  it("throws on non-2xx response", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );
    await expect(
      completeWithClaude({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/429/);
  });

  it("throws when ANTHROPIC_API_KEY is unset", async () => {
    await expect(
      completeWithClaude({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
