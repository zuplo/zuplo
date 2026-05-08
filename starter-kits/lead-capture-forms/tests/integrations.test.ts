import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  postToSlack,
  buildSubmissionAlert,
} from "../modules/integrations/slack.ts";
import {
  sendResendEmail,
  buildSubmissionConfirmation,
  verifyResendSignature,
} from "../modules/integrations/resend.ts";
import {
  callClaude,
  gradeLeadWithClaude,
} from "../modules/integrations/claude.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

describe("integrations/slack — postToSlack via webhook URL", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("SLACK_WEBHOOK_URL");
    clearEnv("SLACK_BOT_TOKEN");
    clearEnv("SLACK_CHANNEL");
  });

  it("POSTs JSON to the configured webhook URL", async () => {
    setEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/T/B/x");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const result = await postToSlack({ text: "hello" });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://hooks.slack.com/services/T/B/x");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.text).toBe("hello");
  });

  it("throws when webhook returns non-2xx", async () => {
    setEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/T/B/x");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid_payload", { status: 400 }),
    );
    await expect(postToSlack({ text: "hi" })).rejects.toThrow(
      /Slack webhook failed/,
    );
  });

  it("throws when neither SLACK_WEBHOOK_URL nor SLACK_BOT_TOKEN is set", async () => {
    await expect(postToSlack({ text: "hi" })).rejects.toThrow(
      /Slack credentials missing/,
    );
  });
});

describe("integrations/slack — postToSlack via chat.postMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("SLACK_WEBHOOK_URL");
    clearEnv("SLACK_BOT_TOKEN");
    clearEnv("SLACK_CHANNEL");
  });

  it("POSTs to /api/chat.postMessage with bearer token when SLACK_BOT_TOKEN is set", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb-test");
    setEnv("SLACK_CHANNEL", "C123");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, ts: "1234.5", channel: "C123" }),
          { status: 200 },
        ),
      );

    const result = await postToSlack({ text: "hi", threadTs: "100.0" });
    expect(result).toEqual({ ok: true, ts: "1234.5", channel: "C123" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer xoxb-test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.channel).toBe("C123");
    expect(body.thread_ts).toBe("100.0");
  });

  it("throws when chat.postMessage HTTP fails", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb-test");
    setEnv("SLACK_CHANNEL", "C123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("server error", { status: 500 }),
    );
    await expect(postToSlack({ text: "hi" })).rejects.toThrow(
      /Slack chat\.postMessage HTTP failed/,
    );
  });

  it("throws when API returns ok=false", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb-test");
    setEnv("SLACK_CHANNEL", "C123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), {
        status: 200,
      }),
    );
    await expect(postToSlack({ text: "hi" })).rejects.toThrow(
      /channel_not_found/,
    );
  });

  it("throws when channel is missing", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb-test");
    await expect(postToSlack({ text: "hi" })).rejects.toThrow(
      /Slack channel missing/,
    );
  });
});

describe("integrations/slack — buildSubmissionAlert", () => {
  it("includes score in headline when provided", () => {
    const msg = buildSubmissionAlert({
      formName: "Demo Request",
      submitterEmail: "x@y.com",
      score: 87,
      routedTo: "Alice",
      payloadPreview: { company: "Acme" },
      submissionId: "sub_1",
    });
    expect(msg.text).toContain("87/100");
    expect(msg.text).toContain("Demo Request");
    expect(msg.blocks).toBeDefined();
  });

  it("uses unknown placeholders when email/owner are missing", () => {
    const msg = buildSubmissionAlert({
      formName: "Form",
      submitterEmail: null,
      score: null,
      routedTo: null,
      payloadPreview: {},
      submissionId: "sub_2",
    });
    expect(msg.text).toBe("New submission — Form");
    const blocksJson = JSON.stringify(msg.blocks);
    expect(blocksJson).toContain("_unknown_");
    expect(blocksJson).toContain("_unassigned_");
  });
});

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------

describe("integrations/resend — sendResendEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RESEND_API_KEY");
    clearEnv("RESEND_FROM_EMAIL");
    clearEnv("RESEND_REPLY_TO");
  });

  it("POSTs to /emails with bearer auth and JSON body", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "hello@kit.test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "email_abc" }), { status: 200 }),
      );

    const res = await sendResendEmail({
      to: "you@x.com",
      subject: "hi",
      text: "body",
      tags: [{ name: "kit", value: "lead-capture-forms" }],
    });

    expect(res.id).toBe("email_abc");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe("you@x.com");
    expect(body.from).toBe("hello@kit.test");
    expect(body.subject).toBe("hi");
    expect(body.tags).toEqual([{ name: "kit", value: "lead-capture-forms" }]);
  });

  it("throws on non-2xx response", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "from@kit.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    await expect(
      sendResendEmail({ to: "x@y.com", subject: "z" }),
    ).rejects.toThrow(/Resend send failed/);
  });

  it("throws when RESEND_API_KEY is unset", async () => {
    clearEnv("RESEND_API_KEY");
    await expect(
      sendResendEmail({ to: "x@y.com", subject: "z" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("throws when RESEND_FROM_EMAIL is unset and no `from` is provided", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    await expect(
      sendResendEmail({ to: "x@y.com", subject: "z" }),
    ).rejects.toThrow(/RESEND_FROM_EMAIL/);
  });
});

describe("integrations/resend — buildSubmissionConfirmation", () => {
  it("escapes HTML in form name", () => {
    const msg = buildSubmissionConfirmation({
      to: "x@y.com",
      formName: "<script>alert(1)</script>",
    });
    expect(msg.html).toContain("&lt;script&gt;");
    expect(msg.html).not.toContain("<script>");
    expect(msg.subject).toContain("<script>");
  });
});

describe("integrations/resend — verifyResendSignature", () => {
  afterEach(() => {
    clearEnv("RESEND_WEBHOOK_SECRET");
  });

  async function signSvix(secret: string, id: string, ts: string, body: string) {
    const keyB64 = secret.replace(/^whsec_/, "");
    const binary = atob(keyB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      new TextEncoder().encode(`${id}.${ts}.${body}`),
    );
    let bin = "";
    for (const b of new Uint8Array(sigBuf)) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  it("returns true for a valid signature", async () => {
    // Use a base64 encoding of some bytes so the secret is parseable.
    const secretB64 = btoa("test-secret-bytes");
    setEnv("RESEND_WEBHOOK_SECRET", `whsec_${secretB64}`);
    const id = "msg_1";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: "email.delivered" });
    const expectedSig = await signSvix(`whsec_${secretB64}`, id, ts, body);

    const headers = new Headers({
      "svix-id": id,
      "svix-timestamp": ts,
      "svix-signature": `v1,${expectedSig}`,
    });
    expect(
      await verifyResendSignature({ rawBody: body, headers }),
    ).toBe(true);
  });

  it("returns false when signature is tampered", async () => {
    const secretB64 = btoa("test-secret-bytes");
    setEnv("RESEND_WEBHOOK_SECRET", `whsec_${secretB64}`);
    const headers = new Headers({
      "svix-id": "msg_1",
      "svix-timestamp": String(Math.floor(Date.now() / 1000)),
      "svix-signature": "v1,deadbeef",
    });
    expect(
      await verifyResendSignature({ rawBody: "{}", headers }),
    ).toBe(false);
  });

  it("returns false when RESEND_WEBHOOK_SECRET is unset", async () => {
    const headers = new Headers({
      "svix-id": "x",
      "svix-timestamp": "0",
      "svix-signature": "v1,xx",
    });
    expect(
      await verifyResendSignature({ rawBody: "{}", headers }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------

describe("integrations/claude — callClaude", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("ANTHROPIC_API_KEY");
    clearEnv("ANTHROPIC_MODEL");
    clearEnv("AI_GATEWAY_URL");
  });

  it("POSTs to /messages with x-api-key + anthropic-version", async () => {
    setEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "hi" }],
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
        { status: 200 },
      ),
    );

    const res = await callClaude({
      messages: [{ role: "user", content: "ping" }],
    });
    expect(res.text).toBe("hi");
    expect(res.inputTokens).toBe(10);
    expect(res.outputTokens).toBe(2);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("x-api-key")).toBe("sk-ant-test");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("claude-3-5-haiku-latest");
    expect(body.messages).toEqual([{ role: "user", content: "ping" }]);
  });

  it("uses AI_GATEWAY_URL when set", async () => {
    setEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    setEnv("AI_GATEWAY_URL", "https://gateway.zuplo.test/anthropic/");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "ok" }],
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
        { status: 200 },
      ),
    );

    await callClaude({ messages: [{ role: "user", content: "hi" }] });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://gateway.zuplo.test/anthropic/messages",
    );
  });

  it("throws on non-2xx response", async () => {
    setEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate_limited", { status: 429 }),
    );
    await expect(
      callClaude({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/Claude call failed/);
  });

  it("throws when ANTHROPIC_API_KEY is unset", async () => {
    await expect(
      callClaude({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe("integrations/claude — gradeLeadWithClaude", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("ANTHROPIC_API_KEY");
  });

  it("parses the JSON object from Claude's response", async () => {
    setEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: '{"score": 87, "intent": "high", "isSpam": false, "reasoning": "business email and a real company name"}',
            },
          ],
          usage: { input_tokens: 50, output_tokens: 30 },
        }),
        { status: 200 },
      ),
    );

    const result = await gradeLeadWithClaude({
      formName: "Demo",
      payload: { email: "ceo@acme.com" },
      submitterEmail: "ceo@acme.com",
    });
    expect(result.score).toBe(87);
    expect(result.intent).toBe("high");
    expect(result.isSpam).toBe(false);
    expect(result.reasoning).toContain("business email");
  });

  it("falls back to defaults when Claude returns garbage", async () => {
    setEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "not-json" }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      ),
    );

    const result = await gradeLeadWithClaude({
      formName: "Demo",
      payload: {},
      submitterEmail: null,
    });
    expect(result.score).toBe(0);
    expect(result.intent).toBe("low");
    expect(result.isSpam).toBe(false);
  });
});
