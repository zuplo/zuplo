import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { sendSlackMessage } from "../modules/integrations/slack.ts";
import {
  createGCalEvent,
  updateGCalEvent,
  deleteGCalEvent,
  listGCalEvents,
} from "../modules/integrations/google-calendar.ts";

/**
 * Integration tests — exercise each module in modules/integrations/.
 *
 * `environment` from `@zuplo/runtime` is a stub that captures `process.env` at
 * load time. To set credentials per-test we mutate the imported `environment`
 * object directly (and clean it up in `afterEach`).
 */

const env = environment as Record<string, string | undefined>;

function setEnv(key: string, value: string) {
  env[key] = value;
}
function clearEnv(...keys: string[]) {
  for (const k of keys) delete env[k];
}

describe("integrations/slack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv(
      "SLACK_WEBHOOK_URL",
      "SLACK_BOT_TOKEN",
      "SLACK_DEFAULT_CHANNEL",
    );
  });

  it("posts to the webhook URL when SLACK_WEBHOOK_URL is set", async () => {
    setEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/T0/B0/abc");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const result = await sendSlackMessage({ text: "hello" });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://hooks.slack.com/services/T0/B0/abc");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.text).toBe("hello");
  });

  it("uses chat.postMessage with bearer auth when only bot token is set", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb-test");
    setEnv("SLACK_DEFAULT_CHANNEL", "#tasks");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, channel: "C123", ts: "1.2" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await sendSlackMessage({ text: "hi" });

    expect(result.ok).toBe(true);
    expect(result.channel).toBe("C123");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer xoxb-test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.channel).toBe("#tasks");
  });

  it("throws when webhook returns non-2xx", async () => {
    setEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/T/B/x");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid_payload", { status: 400 }),
    );

    await expect(sendSlackMessage({ text: "boom" })).rejects.toThrow(/400/);
  });

  it("throws when chat.postMessage returns ok=false", async () => {
    setEnv("SLACK_BOT_TOKEN", "xoxb-test");
    setEnv("SLACK_DEFAULT_CHANNEL", "#tasks");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(sendSlackMessage({ text: "hi" })).rejects.toThrow(
      /channel_not_found/,
    );
  });

  it("throws when no Slack credentials are configured", async () => {
    clearEnv("SLACK_WEBHOOK_URL", "SLACK_BOT_TOKEN");
    await expect(sendSlackMessage({ text: "hi" })).rejects.toThrow(
      /SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN/,
    );
  });
});

describe("integrations/google-calendar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "GOOGLE_CALENDAR_ID");
  });

  it("createGCalEvent POSTs to the calendar events endpoint with bearer auth", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    setEnv("GOOGLE_CALENDAR_ID", "primary");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "evt_1",
          htmlLink: "https://cal.google/x",
          status: "confirmed",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const event = await createGCalEvent({
      summary: "Demo",
      start: { dateTime: "2026-01-01T10:00:00Z" },
      end: { dateTime: "2026-01-01T10:30:00Z" },
    });

    expect(event.id).toBe("evt_1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer ya29.test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.summary).toBe("Demo");
  });

  it("createGCalEvent passes sendUpdates and conferenceDataVersion in querystring", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "x", htmlLink: "" }), { status: 200 }),
      );

    await createGCalEvent({
      summary: "x",
      start: { dateTime: "2026-01-01T10:00:00Z" },
      end: { dateTime: "2026-01-01T10:30:00Z" },
      sendUpdates: "all",
      conferenceData: {
        createRequest: {
          requestId: "abc",
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("sendUpdates=all");
    expect(String(url)).toContain("conferenceDataVersion=1");
  });

  it("createGCalEvent throws on non-2xx", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid_grant", { status: 401 }),
    );

    await expect(
      createGCalEvent({
        summary: "x",
        start: { dateTime: "2026-01-01T10:00:00Z" },
        end: { dateTime: "2026-01-01T10:30:00Z" },
      }),
    ).rejects.toThrow(/401/);
  });

  it("throws when GOOGLE_CALENDAR_ACCESS_TOKEN is unset", async () => {
    clearEnv("GOOGLE_CALENDAR_ACCESS_TOKEN");
    await expect(
      createGCalEvent({
        summary: "x",
        start: { dateTime: "2026-01-01T10:00:00Z" },
        end: { dateTime: "2026-01-01T10:30:00Z" },
      }),
    ).rejects.toThrow(/GOOGLE_CALENDAR_ACCESS_TOKEN/);
  });

  it("updateGCalEvent PATCHes the event url", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "evt_1", htmlLink: "" }), {
          status: 200,
        }),
      );

    await updateGCalEvent("evt_1", { summary: "renamed" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/events/evt_1");
    expect((init as RequestInit).method).toBe("PATCH");
  });

  it("deleteGCalEvent treats 410 as success (idempotent)", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("gone", { status: 410 }),
    );

    await expect(deleteGCalEvent("evt_x")).resolves.toBeUndefined();
  });

  it("deleteGCalEvent throws on non-410 errors", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("server error", { status: 500 }),
    );

    await expect(deleteGCalEvent("evt_x")).rejects.toThrow(/500/);
  });

  it("listGCalEvents passes timeMin/timeMax query params", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: "a", htmlLink: "" }] }), {
        status: 200,
      }),
    );

    const items = await listGCalEvents({
      timeMin: "2026-01-01T00:00:00Z",
      timeMax: "2026-02-01T00:00:00Z",
    });

    expect(items).toHaveLength(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("timeMin=2026-01-01");
    expect(String(url)).toContain("timeMax=2026-02-01");
  });
});
