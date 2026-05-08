import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { sendResendEmail } from "../modules/integrations/resend.ts";
import {
  sendPostmarkEmail,
  verifyPostmarkWebhook,
} from "../modules/integrations/postmark.ts";
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
  "POSTMARK_SERVER_TOKEN",
  "POSTMARK_FROM_EMAIL",
  "POSTMARK_WEBHOOK_USERNAME",
  "POSTMARK_WEBHOOK_PASSWORD",
  "NODE_ENV",
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
  it("POSTs to /emails with bearer auth and correct body", async () => {
    environment.RESEND_API_KEY = "re_test";
    environment.RESEND_FROM_EMAIL = "noreply@example.com";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "abc" }), { status: 200 }),
      );

    const result = await sendResendEmail({
      to: "x@y.com",
      subject: "hi",
      text: "hi",
    });

    expect(result.id).toBe("abc");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe("x@y.com");
    expect(body.from).toBe("noreply@example.com");
    expect(body.subject).toBe("hi");
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

describe("integrations/postmark — sendPostmarkEmail", () => {
  it("POSTs to /email with X-Postmark-Server-Token header", async () => {
    environment.POSTMARK_SERVER_TOKEN = "pm_test";
    environment.POSTMARK_FROM_EMAIL = "support@example.com";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            MessageID: "mid",
            SubmittedAt: "2026-01-01T00:00:00Z",
            To: "x@y.com",
            ErrorCode: 0,
            Message: "OK",
          }),
          { status: 200 },
        ),
      );

    const result = await sendPostmarkEmail({
      to: "x@y.com",
      subject: "Hi",
      textBody: "Hi",
    });
    expect(result.MessageID).toBe("mid");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.postmarkapp.com/email");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("X-Postmark-Server-Token")).toBe("pm_test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.From).toBe("support@example.com");
    expect(body.To).toBe("x@y.com");
    expect(body.MessageStream).toBe("outbound");
  });

  it("throws on non-2xx", async () => {
    environment.POSTMARK_SERVER_TOKEN = "pm_test";
    environment.POSTMARK_FROM_EMAIL = "support@example.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("error", { status: 500 }),
    );
    await expect(
      sendPostmarkEmail({ to: "x@y.com", subject: "z" }),
    ).rejects.toThrow(/Postmark/);
  });

  it("throws when POSTMARK_SERVER_TOKEN is unset", async () => {
    await expect(
      sendPostmarkEmail({ to: "x@y.com", subject: "z" }),
    ).rejects.toThrow(/POSTMARK_SERVER_TOKEN/);
  });
});

describe("integrations/postmark — verifyPostmarkWebhook", () => {
  it("accepts request with matching basic auth", () => {
    environment.POSTMARK_WEBHOOK_USERNAME = "u";
    environment.POSTMARK_WEBHOOK_PASSWORD = "p";
    const auth = `Basic ${btoa("u:p")}`;
    const req = new Request("https://kit.test/", {
      headers: { authorization: auth },
    });
    expect(verifyPostmarkWebhook(req)).toBe(true);
  });

  it("rejects missing or invalid auth", () => {
    environment.POSTMARK_WEBHOOK_USERNAME = "u";
    environment.POSTMARK_WEBHOOK_PASSWORD = "p";
    const noAuth = new Request("https://kit.test/");
    expect(verifyPostmarkWebhook(noAuth)).toBe(false);
    const wrongAuth = new Request("https://kit.test/", {
      headers: { authorization: `Basic ${btoa("u:wrong")}` },
    });
    expect(verifyPostmarkWebhook(wrongAuth)).toBe(false);
  });

  it("fail-open in non-production when credentials unset", () => {
    environment.NODE_ENV = "development";
    const req = new Request("https://kit.test/");
    expect(verifyPostmarkWebhook(req)).toBe(true);
  });

  it("fail-closed in production when credentials unset", () => {
    environment.NODE_ENV = "production";
    const req = new Request("https://kit.test/");
    expect(verifyPostmarkWebhook(req)).toBe(false);
  });
});

describe("integrations/slack", () => {
  it("uses bot token to POST chat.postMessage", async () => {
    environment.SLACK_BOT_TOKEN = "xoxb-test";
    environment.SLACK_DEFAULT_CHANNEL = "#support";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, ts: "1.0", channel: "C123" }),
          { status: 200 },
        ),
      );

    const result = await postSlackMessage({ text: "hi" });
    expect(result.ok).toBe(true);
    expect(result.ts).toBe("1.0");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer xoxb-test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.channel).toBe("#support");
    expect(body.text).toBe("hi");
  });

  it("falls back to webhook URL when no bot token", async () => {
    environment.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/abc";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const result = await postSlackMessage({ text: "hello" });
    expect(result.ok).toBe(true);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://hooks.slack.com/services/abc");
  });

  it("throws when chat.postMessage returns ok=false", async () => {
    environment.SLACK_BOT_TOKEN = "xoxb-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error: "channel_not_found" }),
        { status: 200 },
      ),
    );
    await expect(postSlackMessage({ text: "hi" })).rejects.toThrow(
      /channel_not_found/,
    );
  });

  it("throws when no bot token and no webhook URL", async () => {
    await expect(postSlackMessage({ text: "hi" })).rejects.toThrow(
      /SLACK_BOT_TOKEN|SLACK_WEBHOOK_URL/,
    );
  });

  it("dmSlackUserByEmail looks up user then posts", async () => {
    environment.SLACK_BOT_TOKEN = "xoxb-test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, user: { id: "U999" } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, ts: "2.0", channel: "U999" }),
          { status: 200 },
        ),
      );

    const result = await dmSlackUserByEmail("a@b.com", { text: "Hi" });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [lookupUrl] = fetchMock.mock.calls[0]!;
    expect(String(lookupUrl)).toContain("users.lookupByEmail");
    expect(String(lookupUrl)).toContain("a%40b.com");
    const postBody = JSON.parse(
      (fetchMock.mock.calls[1]![1] as RequestInit).body as string,
    );
    expect(postBody.channel).toBe("U999");
  });

  it("dmSlackUserByEmail throws when bot token missing", async () => {
    await expect(
      dmSlackUserByEmail("a@b.com", { text: "Hi" }),
    ).rejects.toThrow(/SLACK_BOT_TOKEN/);
  });
});

describe("integrations/claude", () => {
  const CLAUDE_RESPONSE = {
    id: "msg_1",
    model: "claude-sonnet-4-5",
    role: "assistant" as const,
    content: [{ type: "text" as const, text: '{"answer":"yes"}' }],
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 5 },
  };

  it("POSTs to /v1/messages with x-api-key + anthropic-version", async () => {
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
    expect(claudeText(result)).toBe('{"answer":"yes"}');
  });

  it("uses AI_GATEWAY_URL when set", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    environment.AI_GATEWAY_URL = "https://gateway.example.com/anthropic";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(CLAUDE_RESPONSE), { status: 200 }),
      );
    await callClaude({ messages: [{ role: "user", content: "hi" }] });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://gateway.example.com/anthropic/v1/messages");
  });

  it("throws on non-2xx", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );
    await expect(
      callClaude({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/Claude/);
  });

  it("throws when ANTHROPIC_API_KEY is unset", async () => {
    await expect(
      callClaude({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it("callClaudeJson parses JSON object response", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...CLAUDE_RESPONSE,
          content: [
            {
              type: "text",
              text: 'Here it is: {"category":"billing","priority":"high"} — done',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await callClaudeJson<{ category: string; priority: string }>({
      messages: [{ role: "user", content: "x" }],
    });
    expect(result.category).toBe("billing");
    expect(result.priority).toBe("high");
  });

  it("callClaudeJson throws on non-JSON output", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...CLAUDE_RESPONSE,
          content: [{ type: "text", text: "totally not json" }],
        }),
        { status: 200 },
      ),
    );
    await expect(
      callClaudeJson({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/JSON/);
  });
});
