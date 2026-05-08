import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendResendEmail } from "../modules/integrations/resend.ts";
import { postSlackMessage } from "../modules/integrations/slack.ts";

describe("integrations/resend", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "inbound@example.com";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it("POSTs /emails with bearer auth", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "msg-1" }), { status: 200 }),
      );
    const out = await sendResendEmail({
      to: "rep@example.com",
      subject: "New lead",
      text: "hi",
    });
    expect(out.id).toBe("msg-1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe("rep@example.com");
    expect(body.from).toBe("inbound@example.com");
  });

  it("throws on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      sendResendEmail({ to: "x", subject: "y" }),
    ).rejects.toThrow(/Resend send failed: 500/);
  });

  it("throws when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(
      sendResendEmail({ to: "x", subject: "y" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("throws when RESEND_FROM_EMAIL is unset (no override)", async () => {
    delete process.env.RESEND_FROM_EMAIL;
    await expect(
      sendResendEmail({ to: "x", subject: "y" }),
    ).rejects.toThrow(/RESEND_FROM_EMAIL/);
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
      new Response(
        JSON.stringify({ ok: true, ts: "1700.0", channel: "C123" }),
        { status: 200 },
      ),
    );
    const result = await postSlackMessage({ text: "Hello" });
    expect(result.ok).toBe(true);
    expect(result.ts).toBe("1700.0");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer xoxb-test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.channel).toBe("C123");
    expect(body.text).toBe("Hello");
  });

  it("bot-token mode passes through provided channel + thread", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ts: "x" }), { status: 200 }),
    );
    await postSlackMessage({
      channel: "C999",
      text: "thread reply",
      threadTs: "1700.0",
    });
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.channel).toBe("C999");
    expect(body.thread_ts).toBe("1700.0");
  });

  it("bot-token mode throws when channel cannot be resolved", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    delete process.env.SLACK_DEFAULT_CHANNEL;
    await expect(postSlackMessage({ text: "no chan" })).rejects.toThrow(
      /SLACK_DEFAULT_CHANNEL/,
    );
  });

  it("uses webhook mode when only SLACK_WEBHOOK_URL is set", async () => {
    process.env.SLACK_WEBHOOK_URL =
      "https://hooks.slack.com/services/T0/B0/secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }),
    );
    const result = await postSlackMessage({ text: "Hi" });
    expect(result.ok).toBe(true);
    expect(result.webhook).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("hooks.slack.com");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.text).toBe("Hi");
  });

  it("webhook mode returns ok:false on non-2xx (does not throw)", async () => {
    process.env.SLACK_WEBHOOK_URL =
      "https://hooks.slack.com/services/T0/B0/secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid_token", { status: 403 }),
    );
    const result = await postSlackMessage({ text: "x" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("403");
  });

  it("returns API error from bot-token response (json.error)", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_DEFAULT_CHANNEL = "C123";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error: "channel_not_found" }),
        { status: 200 },
      ),
    );
    const result = await postSlackMessage({ text: "x" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("channel_not_found");
  });

  it("throws when neither SLACK_BOT_TOKEN nor SLACK_WEBHOOK_URL is set", async () => {
    await expect(postSlackMessage({ text: "x" })).rejects.toThrow(
      /Slack is not configured/,
    );
  });
});
