import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { sendResendEmail } from "../modules/integrations/resend.ts";
import {
  postSlackMessage,
  openSlackDm,
  lookupSlackUserByEmail,
} from "../modules/integrations/slack.ts";
import { completeWithClaude } from "../modules/integrations/claude.ts";

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

  it("POSTs to /emails with bearer auth", async () => {
    (environment as Record<string, string | undefined>).RESEND_API_KEY = "re_test_key";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "r_1" }), { status: 200 }));

    const result = await sendResendEmail({
      to: "to@example.com",
      from: "from@example.com",
      subject: "hi",
      text: "hello",
    });

    expect(result.id).toBe("r_1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer re_test_key");
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

describe("integrations/slack postMessage", () => {
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
      new Response(JSON.stringify({ ok: true, channel: "D0", ts: "1.2" }), {
        status: 200,
      }),
    );

    const result = await postSlackMessage({ channel: "D0", text: "hi" });

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer xoxb-test");
  });

  it("falls back to webhook URL when no bot token", async () => {
    (environment as Record<string, string | undefined>).SLACK_WEBHOOK_URL =
      "https://hooks.slack.com/services/T1/B1/abcdef";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    await postSlackMessage({ text: "hi" });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://hooks.slack.com/services/T1/B1/abcdef");
  });

  it("throws on Web API ok=false", async () => {
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

  it("throws when no Slack credentials are set", async () => {
    await expect(postSlackMessage({ text: "x" })).rejects.toThrow(
      /No Slack credentials/,
    );
  });
});

describe("integrations/slack openSlackDm", () => {
  let snap: Record<string, string | undefined>;
  beforeEach(() => {
    snap = snapshotEnv();
    clearEnv();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv(snap);
  });

  it("calls conversations.open and returns the channel id", async () => {
    (environment as Record<string, string | undefined>).SLACK_BOT_TOKEN = "xoxb-test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, channel: { id: "D123" } }), {
        status: 200,
      }),
    );

    const result = await openSlackDm({ userId: "U001" });

    expect(result.channelId).toBe("D123");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/conversations.open");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer xoxb-test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.users).toBe("U001");
  });

  it("throws on non-ok response", async () => {
    (environment as Record<string, string | undefined>).SLACK_BOT_TOKEN = "xoxb-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "user_not_found" }), {
        status: 200,
      }),
    );
    await expect(openSlackDm({ userId: "U999" })).rejects.toThrow(
      /user_not_found/,
    );
  });

  it("throws when SLACK_BOT_TOKEN is missing", async () => {
    await expect(openSlackDm({ userId: "U001" })).rejects.toThrow(
      /SLACK_BOT_TOKEN/,
    );
  });
});

describe("integrations/slack lookupSlackUserByEmail", () => {
  let snap: Record<string, string | undefined>;
  beforeEach(() => {
    snap = snapshotEnv();
    clearEnv();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv(snap);
  });

  it("calls users.lookupByEmail and returns the user id", async () => {
    (environment as Record<string, string | undefined>).SLACK_BOT_TOKEN = "xoxb-test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, user: { id: "U123" } }), {
        status: 200,
      }),
    );

    const result = await lookupSlackUserByEmail("buddy@kit.test");

    expect(result.userId).toBe("U123");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(typeof url).toBe("string");
    const urlStr = url as string;
    expect(urlStr).toContain("users.lookupByEmail");
    expect(urlStr).toContain("email=buddy%40kit.test");
    const headers = new Headers((init as RequestInit | undefined)?.headers);
    expect(headers.get("authorization")).toBe("Bearer xoxb-test");
  });

  it("throws on Web API ok=false (e.g. users_not_found)", async () => {
    (environment as Record<string, string | undefined>).SLACK_BOT_TOKEN = "xoxb-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "users_not_found" }), {
        status: 200,
      }),
    );
    await expect(lookupSlackUserByEmail("nobody@kit.test")).rejects.toThrow(
      /users_not_found/,
    );
  });

  it("throws when SLACK_BOT_TOKEN is missing", async () => {
    await expect(lookupSlackUserByEmail("x@kit.test")).rejects.toThrow(
      /SLACK_BOT_TOKEN/,
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

  function fakeAnthropicResponse(text = "hi") {
    return new Response(
      JSON.stringify({
        id: "msg_01",
        model: "claude-sonnet-4-7-20251022",
        stop_reason: "end_turn",
        content: [{ type: "text", text }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
      { status: 200 },
    );
  }

  it("POSTs to api.anthropic.com with x-api-key", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeAnthropicResponse("hi"));

    const result = await completeWithClaude({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.text).toBe("hi");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("x-api-key")).toBe("sk-ant-test");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
  });

  it("routes through AI_GATEWAY_URL when set", async () => {
    (environment as Record<string, string | undefined>).ANTHROPIC_API_KEY = "sk-ant-test";
    (environment as Record<string, string | undefined>).AI_GATEWAY_URL =
      "https://gw.example.com/p";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeAnthropicResponse("hi"));

    await completeWithClaude({ messages: [{ role: "user", content: "x" }] });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://gw.example.com/p/v1/messages");
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
