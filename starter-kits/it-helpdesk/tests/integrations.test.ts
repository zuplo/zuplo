import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { sendResendEmail } from "../modules/integrations/resend.ts";
import {
  postSlackMessage,
  dmSlackUserByEmail,
} from "../modules/integrations/slack.ts";
import {
  callClaude,
  callClaudeJson,
  claudeText,
} from "../modules/integrations/claude.ts";

const ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "SLACK_BOT_TOKEN",
  "SLACK_WEBHOOK_URL",
  "SLACK_DEFAULT_CHANNEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "AI_GATEWAY_URL",
];
function clearEnv() {
  for (const key of ENV_KEYS) {
    delete (environment as Record<string, string | undefined>)[key];
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  clearEnv();
});

describe("integrations/resend", () => {
  it("POSTs to /emails with bearer auth", async () => {
    environment.RESEND_API_KEY = "re_test";
    environment.RESEND_FROM_EMAIL = "noreply@example.com";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "abc" }), { status: 200 }),
      );

    const result = await sendResendEmail({
      to: "user@example.com",
      subject: "Update",
      text: "hello",
    });
    expect(result.id).toBe("abc");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe("user@example.com");
    expect(body.from).toBe("noreply@example.com");
  });

  it("throws on non-2xx", async () => {
    environment.RESEND_API_KEY = "re_test";
    environment.RESEND_FROM_EMAIL = "noreply@example.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    await expect(
      sendResendEmail({ to: "x@y.com", subject: "z" }),
    ).rejects.toThrow(/Resend/);
  });

  it("throws when RESEND_API_KEY is unset", async () => {
    await expect(
      sendResendEmail({ to: "x@y.com", subject: "z" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});

describe("integrations/slack", () => {
  it("posts via bot token to chat.postMessage with custom default channel", async () => {
    environment.SLACK_BOT_TOKEN = "xoxb-test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, ts: "1.0", channel: "C1" }),
          { status: 200 },
        ),
      );

    const result = await postSlackMessage({ text: "hi" });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.channel).toBe("#it-helpdesk");
  });

  it("falls back to webhook URL", async () => {
    environment.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/xyz";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const result = await postSlackMessage({ text: "hi" });
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://hooks.slack.com/services/xyz",
    );
  });

  it("throws when chat.postMessage returns ok=false", async () => {
    environment.SLACK_BOT_TOKEN = "xoxb-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
        status: 200,
      }),
    );
    await expect(postSlackMessage({ text: "hi" })).rejects.toThrow(
      /rate_limited/,
    );
  });

  it("throws when nothing is configured", async () => {
    await expect(postSlackMessage({ text: "hi" })).rejects.toThrow(
      /SLACK_BOT_TOKEN|SLACK_WEBHOOK_URL/,
    );
  });

  it("dmSlackUserByEmail issues lookupByEmail then posts", async () => {
    environment.SLACK_BOT_TOKEN = "xoxb-test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, user: { id: "U42" } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, ts: "1", channel: "U42" }),
          { status: 200 },
        ),
      );

    const result = await dmSlackUserByEmail("alice@example.com", { text: "Hi" });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "users.lookupByEmail",
    );
  });
});

describe("integrations/claude", () => {
  const CLAUDE_RESPONSE = {
    id: "msg_1",
    model: "claude-sonnet-4-5",
    role: "assistant" as const,
    content: [{ type: "text" as const, text: "ok" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 1, output_tokens: 1 },
  };

  it("POSTs to /v1/messages with required headers and default model", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(CLAUDE_RESPONSE), { status: 200 }),
      );

    const result = await callClaude({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.id).toBe("msg_1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("x-api-key")).toBe("sk-test");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("claude-sonnet-4-5");
    expect(body.max_tokens).toBe(1024);
    expect(claudeText(result)).toBe("ok");
  });

  it("uses AI_GATEWAY_URL when provided", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    environment.AI_GATEWAY_URL = "https://gw.example/anthropic";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(CLAUDE_RESPONSE), { status: 200 }),
      );
    await callClaude({ messages: [{ role: "user", content: "hi" }] });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://gw.example/anthropic/v1/messages",
    );
  });

  it("throws on non-2xx response", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      callClaude({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/Claude/);
  });

  it("throws when ANTHROPIC_API_KEY is unset", async () => {
    await expect(
      callClaude({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it("callClaudeJson parses an embedded JSON object", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...CLAUDE_RESPONSE,
          content: [
            {
              type: "text",
              text: 'Sure, here: {"category":"hardware","priority":"high"}',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await callClaudeJson<{
      category: string;
      priority: string;
    }>({ messages: [{ role: "user", content: "x" }] });
    expect(result.category).toBe("hardware");
    expect(result.priority).toBe("high");
  });

  it("callClaudeJson throws when response has no JSON", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...CLAUDE_RESPONSE,
          content: [{ type: "text", text: "no json here" }],
        }),
        { status: 200 },
      ),
    );
    await expect(
      callClaudeJson({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/JSON/);
  });
});
