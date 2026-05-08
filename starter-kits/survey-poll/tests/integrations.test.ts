import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { sendResendEmail } from "../modules/integrations/resend.ts";
import { sendTwilioSms } from "../modules/integrations/twilio.ts";
import { sendSlackMessage } from "../modules/integrations/slack.ts";
import { callClaude } from "../modules/integrations/claude.ts";

const env = environment as Record<string, string | undefined>;

function setEnv(key: string, value: string) {
  env[key] = value;
}
function clearEnv(...keys: string[]) {
  for (const k of keys) delete env[k];
}

describe("integrations/resend", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RESEND_API_KEY", "RESEND_FROM_EMAIL");
  });

  it("POSTs to /emails with bearer auth", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "re_msg_1" }), { status: 200 }),
    );

    const result = await sendResendEmail({
      to: "x@y.com",
      subject: "hi",
      text: "hi",
    });

    expect(result.id).toBe("re_msg_1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe("x@y.com");
    expect(body.from).toBe("noreply@example.com");
    expect(body.subject).toBe("hi");
  });

  it("forwards an Idempotency-Key when supplied", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "id_a" }), { status: 200 }),
    );

    await sendResendEmail({
      to: "x@y.com",
      subject: "hi",
      idempotencyKey: "abc-123",
    });

    const headers = new Headers(
      (fetchMock.mock.calls[0]![1] as RequestInit).headers,
    );
    expect(headers.get("idempotency-key")).toBe("abc-123");
  });

  it("throws on non-2xx", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );

    await expect(
      sendResendEmail({ to: "x@y.com", subject: "hi" }),
    ).rejects.toThrow(/403/);
  });

  it("throws when RESEND_API_KEY is unset", async () => {
    clearEnv("RESEND_API_KEY");
    await expect(
      sendResendEmail({ to: "x@y.com", subject: "hi" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("throws when no `from` is supplied or configured", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    clearEnv("RESEND_FROM_EMAIL");
    await expect(
      sendResendEmail({ to: "x@y.com", subject: "hi" }),
    ).rejects.toThrow(/RESEND_FROM_EMAIL/);
  });
});

describe("integrations/twilio", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv(
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_FROM_NUMBER",
      "TWILIO_MESSAGING_SERVICE_SID",
    );
  });

  it("POSTs to /Messages.json with Basic auth and From= when from-number is set", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok-test");
    setEnv("TWILIO_FROM_NUMBER", "+15550100");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sid: "SM1",
          status: "queued",
          to: "+15550199",
          from: "+15550100",
          body: "hi",
          date_created: "x",
          num_segments: "1",
          price: null,
          error_code: null,
          error_message: null,
        }),
        { status: 201 },
      ),
    );

    const r = await sendTwilioSms({ to: "+15550199", body: "hi" });
    expect(r.sid).toBe("SM1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json",
    );
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toMatch(/^Basic /);
  });

  it("throws on non-2xx", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok-test");
    setEnv("TWILIO_FROM_NUMBER", "+15550100");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid", { status: 400 }),
    );

    await expect(sendTwilioSms({ to: "+1", body: "hi" })).rejects.toThrow(/400/);
  });

  it("throws when TWILIO_ACCOUNT_SID is unset", async () => {
    clearEnv("TWILIO_ACCOUNT_SID");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    await expect(sendTwilioSms({ to: "+1", body: "hi" })).rejects.toThrow(
      /TWILIO_ACCOUNT_SID/,
    );
  });
});

describe("integrations/slack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("SLACK_WEBHOOK_URL", "SLACK_BOT_TOKEN", "SLACK_DEFAULT_CHANNEL");
  });

  it("posts to webhook URL when SLACK_WEBHOOK_URL is set", async () => {
    setEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/T/B/x");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    await sendSlackMessage({ text: "hi" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("hooks.slack.com");
  });

  it("throws on non-2xx webhook response", async () => {
    setEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/T/B/x");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid_payload", { status: 400 }),
    );
    await expect(sendSlackMessage({ text: "hi" })).rejects.toThrow(/400/);
  });

  it("throws when no Slack credentials are set", async () => {
    await expect(sendSlackMessage({ text: "hi" })).rejects.toThrow(
      /SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN/,
    );
  });
});

describe("integrations/claude", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv(
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_API_BASE",
      "AI_GATEWAY_URL",
      "CLAUDE_MODEL",
    );
  });

  it("POSTs to Anthropic /v1/messages with x-api-key", async () => {
    setEnv("ANTHROPIC_API_KEY", "sk-test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "hello" }],
          model: "claude-sonnet-4-5",
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 1 },
        }),
        { status: 200 },
      ),
    );

    const r = await callClaude({ messages: [{ role: "user", content: "hi" }] });
    expect(r.text).toBe("hello");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("x-api-key")).toBe("sk-test");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
  });

  it("uses AI_GATEWAY_URL override when set", async () => {
    setEnv("ANTHROPIC_API_KEY", "sk-test");
    setEnv("AI_GATEWAY_URL", "https://gateway.example.com");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "x",
          type: "message",
          role: "assistant",
          content: [],
          model: "x",
          stop_reason: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
        { status: 200 },
      ),
    );

    await callClaude({ messages: [{ role: "user", content: "hi" }] });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://gateway.example.com/v1/messages",
    );
  });

  it("throws on non-2xx", async () => {
    setEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );
    await expect(
      callClaude({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/429/);
  });

  it("throws when ANTHROPIC_API_KEY is unset", async () => {
    clearEnv("ANTHROPIC_API_KEY");
    await expect(
      callClaude({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
