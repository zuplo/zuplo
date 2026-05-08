import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendResendEmail,
  verifyResendWebhook,
} from "../modules/integrations/resend.ts";
import {
  sendTwilioSms,
  verifyTwilioWebhook,
} from "../modules/integrations/twilio.ts";
import { postSlackMessage } from "../modules/integrations/slack.ts";
import { callClaude, parseClaudeJson } from "../modules/integrations/claude.ts";

describe("integrations/resend", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "surveys@example.com";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.RESEND_WEBHOOK_SIGNING_SECRET;
  });

  it("POSTs to /emails with bearer auth and tags", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "msg-1" }), { status: 200 }),
      );
    const out = await sendResendEmail({
      to: "user@x.com",
      subject: "Survey",
      text: "click me",
      tags: [{ name: "tenant_id", value: "t-1" }],
    });
    expect(out.id).toBe("msg-1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.tags).toEqual([{ name: "tenant_id", value: "t-1" }]);
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

  it("verifyResendWebhook accepts a correct svix v1 signature", async () => {
    // Build a base64-encoded HMAC secret (whsec_...)
    const rawSecret = "abcdefghijklmnop";
    const secretB64 = btoa(rawSecret);
    process.env.RESEND_WEBHOOK_SIGNING_SECRET = `whsec_${secretB64}`;
    const id = "msg_evt_1";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = `{"type":"email.bounced"}`;
    const enc = new TextEncoder();
    const keyBytes = Uint8Array.from(rawSecret, (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      enc.encode(`${id}.${ts}.${body}`),
    );
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    const ok = await verifyResendWebhook(body, {
      svixId: id,
      svixTimestamp: ts,
      svixSignature: `v1,${expected}`,
    });
    expect(ok).toBe(true);
  });

  it("verifyResendWebhook rejects bad signature", async () => {
    const rawSecret = "abcdefghijklmnop";
    process.env.RESEND_WEBHOOK_SIGNING_SECRET = `whsec_${btoa(rawSecret)}`;
    const ok = await verifyResendWebhook("body", {
      svixId: "x",
      svixTimestamp: "1700",
      svixSignature: "v1,WRONG=",
    });
    expect(ok).toBe(false);
  });

  it("verifyResendWebhook throws when signing secret is unset", async () => {
    await expect(
      verifyResendWebhook("body", {
        svixId: "x",
        svixTimestamp: "1700",
        svixSignature: "v1,WRONG=",
      }),
    ).rejects.toThrow(/RESEND_WEBHOOK_SIGNING_SECRET/);
  });
});

describe("integrations/twilio", () => {
  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "tok-secret";
    process.env.TWILIO_FROM_NUMBER = "+15551234567";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
  });

  it("sendTwilioSms POSTs form-encoded with basic auth", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sid: "SM_1",
          status: "queued",
          to: "+15559999999",
          from: "+15551234567",
        }),
        { status: 200 },
      ),
    );
    const result = await sendTwilioSms({
      to: "+15559999999",
      body: "hi",
      statusCallback: "https://kit.test/webhooks/twilio",
    });
    expect(result.sid).toBe("SM_1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
    );
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe(`Basic ${btoa("AC123:tok-secret")}`);
    expect(headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    const body = String((init as RequestInit).body);
    expect(body).toContain("To=%2B15559999999");
    expect(body).toContain("From=%2B15551234567");
    expect(body).toContain("StatusCallback=");
  });

  it("sendTwilioSms uses MessagingServiceSid when from starts with MG", async () => {
    process.env.TWILIO_FROM_NUMBER = "MG-svc-1";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ sid: "SM_2", status: "queued", to: "+1", from: "MG-svc-1" }),
          { status: 200 },
        ),
      );
    await sendTwilioSms({ to: "+15559999999", body: "x" });
    const body = String((fetchMock.mock.calls[0]![1] as RequestInit).body);
    expect(body).toContain("MessagingServiceSid=MG-svc-1");
    expect(body).not.toContain("From=MG");
  });

  it("sendTwilioSms throws on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 400 }),
    );
    await expect(
      sendTwilioSms({ to: "+15551112222", body: "x" }),
    ).rejects.toThrow(/Twilio SMS send failed: 400/);
  });

  it("sendTwilioSms throws when TWILIO_ACCOUNT_SID is unset", async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    await expect(
      sendTwilioSms({ to: "+1", body: "x" }),
    ).rejects.toThrow(/TWILIO_ACCOUNT_SID/);
  });

  it("sendTwilioSms throws when TWILIO_FROM_NUMBER is unset and no override", async () => {
    delete process.env.TWILIO_FROM_NUMBER;
    await expect(
      sendTwilioSms({ to: "+1", body: "x" }),
    ).rejects.toThrow(/TWILIO_FROM_NUMBER/);
  });

  it("verifyTwilioWebhook accepts correct HMAC-SHA1 signature", async () => {
    const fullUrl = "https://kit.test/webhooks/twilio";
    const params = { MessageSid: "SM-1", MessageStatus: "delivered" };
    const enc = new TextEncoder();
    let payload = fullUrl;
    for (const k of Object.keys(params).sort()) {
      payload += k + (params as Record<string, string>)[k];
    }
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      enc.encode("tok-secret"),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(payload));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    const ok = await verifyTwilioWebhook(fullUrl, params, expected);
    expect(ok).toBe(true);
  });

  it("verifyTwilioWebhook rejects bad signature", async () => {
    const ok = await verifyTwilioWebhook(
      "https://kit.test/webhooks/twilio",
      { x: "y" },
      "BAD",
    );
    expect(ok).toBe(false);
  });

  it("verifyTwilioWebhook throws when TWILIO_AUTH_TOKEN is unset", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    await expect(
      verifyTwilioWebhook("https://x", {}, "X"),
    ).rejects.toThrow(/TWILIO_AUTH_TOKEN/);
  });
});

describe("integrations/slack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_DEFAULT_CHANNEL;
    delete process.env.SLACK_WEBHOOK_URL;
  });

  it("uses bot-token mode and posts blocks payload", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_DEFAULT_CHANNEL = "C123";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ts: "1.0" }), { status: 200 }),
    );
    const result = await postSlackMessage({
      text: "Detractor alert",
      blocks: [{ type: "section", text: "x" }],
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.blocks).toHaveLength(1);
  });

  it("uses webhook fallback when no bot token", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/X/Y/Z";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }),
    );
    const result = await postSlackMessage({ text: "hi" });
    expect(result.ok).toBe(true);
    expect(result.webhook).toBe(true);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("hooks.slack.com");
  });

  it("throws when neither token nor webhook is set", async () => {
    await expect(postSlackMessage({ text: "x" })).rejects.toThrow(
      /Slack is not configured/,
    );
  });
});

describe("integrations/claude", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_GATEWAY_URL;
  });

  it("calls api.anthropic.com with x-api-key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg",
          model: "x",
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      ),
    );
    const result = await callClaude({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.text).toBe("ok");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("x-api-key")).toBe("sk-ant-test");
  });

  it("uses AI_GATEWAY_URL when configured", async () => {
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
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://gw.example.zuplo.app/v1/messages",
    );
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
    await expect(
      callClaude({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it("parseClaudeJson handles fenced code", () => {
    expect(parseClaudeJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});
