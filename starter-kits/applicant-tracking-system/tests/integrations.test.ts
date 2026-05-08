import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { sendResendEmail } from "../modules/integrations/resend.ts";
import { createCalendarEvent } from "../modules/integrations/google-calendar.ts";
import { completeWithClaude } from "../modules/integrations/claude.ts";

const ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "GOOGLE_OAUTH_ACCESS_TOKEN",
  "GOOGLE_CALENDAR_ID",
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

describe("integrations/google-calendar", () => {
  let snap: Record<string, string | undefined>;
  beforeEach(() => {
    snap = snapshotEnv();
    clearEnv();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv(snap);
  });

  it("POSTs to /events with bearer auth and parses response", async () => {
    (environment as Record<string, string | undefined>).GOOGLE_OAUTH_ACCESS_TOKEN = "ya29.tok";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "evt_1",
          htmlLink: "https://calendar.google.com/event?eid=abc",
          status: "confirmed",
        }),
        { status: 200 },
      ),
    );

    const result = await createCalendarEvent({
      summary: "Interview",
      start: { dateTime: "2026-06-14T10:00:00-07:00" },
      end: { dateTime: "2026-06-14T11:00:00-07:00" },
      attendees: [{ email: "candidate@example.com" }],
    });

    expect(result.id).toBe("evt_1");
    expect(result.htmlLink).toBe("https://calendar.google.com/event?eid=abc");
    expect(result.status).toBe("confirmed");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(typeof url).toBe("string");
    expect(url as string).toMatch(
      /^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/primary\/events\?/,
    );
    expect(url as string).toContain("sendUpdates=all");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer ya29.tok");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.summary).toBe("Interview");
    expect(body.attendees).toEqual([{ email: "candidate@example.com" }]);
  });

  it("uses GOOGLE_CALENDAR_ID and conferencing when configured", async () => {
    (environment as Record<string, string | undefined>).GOOGLE_OAUTH_ACCESS_TOKEN = "ya29.tok";
    (environment as Record<string, string | undefined>).GOOGLE_CALENDAR_ID =
      "team@calendar.google.com";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "evt_meet",
          htmlLink: "https://calendar.google.com/event",
          status: "confirmed",
          conferenceData: {
            entryPoints: [{ uri: "https://meet.google.com/abc-defg-hij" }],
          },
        }),
        { status: 200 },
      ),
    );

    const result = await createCalendarEvent({
      summary: "Onsite",
      start: { dateTime: "2026-06-14T10:00:00-07:00" },
      end: { dateTime: "2026-06-14T11:00:00-07:00" },
      conferenceRequestId: "req-1",
    });

    expect(result.hangoutLink).toBe("https://meet.google.com/abc-defg-hij");
    const [url, init] = fetchMock.mock.calls[0]!;
    const urlStr = url as string;
    expect(urlStr).toContain("calendars/team%40calendar.google.com");
    expect(urlStr).toContain("conferenceDataVersion=1");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.conferenceData.createRequest.requestId).toBe("req-1");
  });

  it("throws on non-2xx response", async () => {
    (environment as Record<string, string | undefined>).GOOGLE_OAUTH_ACCESS_TOKEN = "ya29.tok";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Forbidden", { status: 403 }),
    );
    await expect(
      createCalendarEvent({
        summary: "x",
        start: { dateTime: "2026-06-14T10:00:00Z" },
        end: { dateTime: "2026-06-14T11:00:00Z" },
      }),
    ).rejects.toThrow(/403/);
  });

  it("throws when GOOGLE_OAUTH_ACCESS_TOKEN is unset", async () => {
    await expect(
      createCalendarEvent({
        summary: "x",
        start: { dateTime: "2026-06-14T10:00:00Z" },
        end: { dateTime: "2026-06-14T11:00:00Z" },
      }),
    ).rejects.toThrow(/GOOGLE_OAUTH_ACCESS_TOKEN/);
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

    await completeWithClaude({ messages: [{ role: "user", content: "hi" }] });

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
