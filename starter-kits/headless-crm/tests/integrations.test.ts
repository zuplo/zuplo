import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendResendEmail } from "../modules/integrations/resend.ts";
import {
  createGCalEvent,
  listGCalEvents,
} from "../modules/integrations/google-calendar.ts";
import { callClaude } from "../modules/integrations/claude.ts";

describe("integrations/resend", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "crm@example.com";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it("POSTs to /emails with bearer auth and correct body shape", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "msg_abc" }), { status: 200 }),
      );

    const result = await sendResendEmail({
      to: "x@y.com",
      subject: "hi",
      text: "hello there",
      replyTo: "rep@example.com",
    });

    expect(result.id).toBe("msg_abc");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe("x@y.com");
    expect(body.from).toBe("crm@example.com");
    expect(body.subject).toBe("hi");
    expect(body.text).toBe("hello there");
    expect(body.reply_to).toBe("rep@example.com");
  });

  it("throws on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    await expect(
      sendResendEmail({ to: "x@y.com", subject: "z", text: "n" }),
    ).rejects.toThrow(/Resend send failed: 403/);
  });

  it("throws when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(
      sendResendEmail({ to: "x@y.com", subject: "z" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("throws when RESEND_FROM_EMAIL is unset and no override", async () => {
    delete process.env.RESEND_FROM_EMAIL;
    await expect(
      sendResendEmail({ to: "x@y.com", subject: "z" }),
    ).rejects.toThrow(/RESEND_FROM_EMAIL/);
  });
});

describe("integrations/google-calendar", () => {
  beforeEach(() => {
    process.env.GOOGLE_CALENDAR_ACCESS_TOKEN = "ya29.test";
    process.env.GOOGLE_CALENDAR_ID = "primary";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
    delete process.env.GOOGLE_CALENDAR_ID;
  });

  it("listGCalEvents calls calendar GET with auth and time params", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "evt1",
              summary: "Demo call",
              start: { dateTime: "2026-04-01T10:00:00Z" },
              end: { dateTime: "2026-04-01T11:00:00Z" },
              attendees: [{ email: "alice@acme.com" }],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const events = await listGCalEvents({
      timeMin: "2026-01-01T00:00:00Z",
      attendeeEmail: "alice@acme.com",
    });

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("evt1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    expect(String(url)).toContain("timeMin=2026-01-01T00%3A00%3A00Z");
    expect(String(url)).toContain("singleEvents=true");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer ya29.test");
  });

  it("listGCalEvents filters by attendee email locally", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "evt1",
              start: { dateTime: "2026-04-01T10:00:00Z" },
              end: { dateTime: "2026-04-01T11:00:00Z" },
              attendees: [{ email: "alice@acme.com" }],
            },
            {
              id: "evt2",
              start: { dateTime: "2026-04-02T10:00:00Z" },
              end: { dateTime: "2026-04-02T11:00:00Z" },
              attendees: [{ email: "bob@other.com" }],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const events = await listGCalEvents({ attendeeEmail: "alice@acme.com" });
    expect(events.map((e) => e.id)).toEqual(["evt1"]);
  });

  it("createGCalEvent POSTs JSON body to events endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "evt-new",
          start: { dateTime: "2026-04-01T10:00:00Z" },
          end: { dateTime: "2026-04-01T11:00:00Z" },
        }),
        { status: 200 },
      ),
    );

    const created = await createGCalEvent({
      summary: "Disco",
      start: "2026-04-01T10:00:00Z",
      end: "2026-04-01T11:00:00Z",
      timeZone: "UTC",
      attendees: [{ email: "alice@acme.com" }],
    });

    expect(created.id).toBe("evt-new");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/calendars/primary/events");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.summary).toBe("Disco");
    expect(body.start.dateTime).toBe("2026-04-01T10:00:00Z");
    expect(body.start.timeZone).toBe("UTC");
    expect(body.attendees).toEqual([{ email: "alice@acme.com" }]);
  });

  it("listGCalEvents throws on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    await expect(listGCalEvents()).rejects.toThrow(
      /Google Calendar list failed: 403/,
    );
  });

  it("createGCalEvent throws on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad", { status: 400 }),
    );
    await expect(
      createGCalEvent({
        summary: "x",
        start: "2026-04-01T10:00:00Z",
        end: "2026-04-01T11:00:00Z",
      }),
    ).rejects.toThrow(/Google Calendar create failed: 400/);
  });

  it("throws when GOOGLE_CALENDAR_ACCESS_TOKEN is unset", async () => {
    delete process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
    await expect(listGCalEvents()).rejects.toThrow(
      /GOOGLE_CALENDAR_ACCESS_TOKEN/,
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
    delete process.env.ANTHROPIC_MODEL;
  });

  it("calls api.anthropic.com with x-api-key and correct body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_1",
          model: "claude-sonnet-4-7-20251022",
          content: [{ type: "text", text: "Hi there." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200 },
      ),
    );

    const result = await callClaude({
      system: "You are helpful.",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.text).toBe("Hi there.");
    expect(result.id).toBe("msg_1");
    expect(result.usage.input_tokens).toBe(10);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("x-api-key")).toBe("sk-ant-test");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("claude-sonnet-4-7-20251022");
    expect(body.system).toBe("You are helpful.");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("routes through AI_GATEWAY_URL when configured", async () => {
    process.env.AI_GATEWAY_URL = "https://gw.example.zuplo.app";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_g",
          model: "claude-sonnet-4-7-20251022",
          content: [{ type: "text", text: "Gateway response" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 2 },
        }),
        { status: 200 },
      ),
    );

    const result = await callClaude({
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.text).toBe("Gateway response");
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://gw.example.zuplo.app/v1/messages");
  });

  it("works with AI_GATEWAY_URL when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.AI_GATEWAY_URL = "https://gw.example.zuplo.app";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_g2",
          model: "claude-sonnet-4-7-20251022",
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
    expect(result.id).toBe("msg_g2");
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.has("x-api-key")).toBe(false);
  });

  it("throws on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );
    await expect(
      callClaude({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/Claude call failed: 429/);
  });

  it("throws when both ANTHROPIC_API_KEY and AI_GATEWAY_URL are unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_GATEWAY_URL;
    await expect(
      callClaude({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
