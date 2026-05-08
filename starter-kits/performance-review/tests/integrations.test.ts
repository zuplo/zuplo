import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { sendResendEmail } from "../modules/integrations/resend.ts";
import { completeWithClaude } from "../modules/integrations/claude.ts";

const ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
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
    const body = JSON.parse(requestInit.body as string);
    expect(body.to).toBe("to@example.com");
    expect(body.subject).toBe("hi");
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
      new Response("forbidden", { status: 403 }),
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

  it("POSTs to api.anthropic.com with x-api-key and anthropic-version", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeAnthropicResponse());

    const result = await completeWithClaude({
      messages: [{ role: "user", content: "hello" }],
      system: "be concise",
    });

    expect(result.text).toBe("hi there");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("x-api-key")).toBe("sk-ant-test");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.system).toBe("be concise");
  });

  it("routes through AI_GATEWAY_URL when set", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    (environment as Record<string, string | undefined>).AI_GATEWAY_URL =
      "https://gw.example.com/p";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeAnthropicResponse());

    await completeWithClaude({ messages: [{ role: "user", content: "hi" }] });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://gw.example.com/p/v1/messages");
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
            { type: "text", text: "A" },
            { type: "tool_use" },
            { type: "text", text: "B" },
          ],
          usage: { input_tokens: 1, output_tokens: 2 },
        }),
        { status: 200 },
      ),
    );

    const result = await completeWithClaude({
      messages: [{ role: "user", content: "x" }],
    });

    expect(result.text).toBe("AB");
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
