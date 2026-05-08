import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  createGCalEvent,
  updateGCalEvent,
  deleteGCalEvent,
  listGCalEvents,
} from "../modules/integrations/google-calendar.ts";
import {
  getZoomAccessToken,
  createZoomMeeting,
  deleteZoomMeeting,
} from "../modules/integrations/zoom.ts";
import { sendTwilioSms } from "../modules/integrations/twilio.ts";

const env = environment as Record<string, string | undefined>;

function setEnv(key: string, value: string) {
  env[key] = value;
}
function clearEnv(...keys: string[]) {
  for (const k of keys) delete env[k];
}

describe("integrations/google-calendar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "GOOGLE_CALENDAR_ID");
  });

  it("createGCalEvent POSTs with bearer auth and returns the event", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "evt_book",
          htmlLink: "https://cal.google/x",
          hangoutLink: "https://meet.google/abc",
        }),
        { status: 200 },
      ),
    );

    const event = await createGCalEvent({
      summary: "30min: Alice",
      start: { dateTime: "2026-02-01T15:00:00Z" },
      end: { dateTime: "2026-02-01T15:30:00Z" },
      attendees: [{ email: "alice@example.com" }],
    });

    expect(event.id).toBe("evt_book");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/calendars/primary/events");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer ya29.test");
  });

  it("createGCalEvent throws on non-2xx", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );

    await expect(
      createGCalEvent({
        summary: "x",
        start: { dateTime: "2026-02-01T15:00:00Z" },
        end: { dateTime: "2026-02-01T15:30:00Z" },
      }),
    ).rejects.toThrow(/403/);
  });

  it("createGCalEvent throws when GOOGLE_CALENDAR_ACCESS_TOKEN is unset", async () => {
    clearEnv("GOOGLE_CALENDAR_ACCESS_TOKEN");
    await expect(
      createGCalEvent({
        summary: "x",
        start: { dateTime: "2026-02-01T15:00:00Z" },
        end: { dateTime: "2026-02-01T15:30:00Z" },
      }),
    ).rejects.toThrow(/GOOGLE_CALENDAR_ACCESS_TOKEN/);
  });

  it("deleteGCalEvent treats 410 as success", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 410 }));
    await expect(deleteGCalEvent("evt")).resolves.toBeUndefined();
  });

  it("listGCalEvents passes timeMin/timeMax/q in query string", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));

    await listGCalEvents({
      timeMin: "2026-02-01T00:00:00Z",
      timeMax: "2026-03-01T00:00:00Z",
      q: "demo",
      maxResults: 25,
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("timeMin=");
    expect(String(url)).toContain("timeMax=");
    expect(String(url)).toContain("q=demo");
    expect(String(url)).toContain("maxResults=25");
  });

  it("updateGCalEvent issues PATCH with bearer auth", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "evt", htmlLink: "" }), { status: 200 }),
    );

    await updateGCalEvent("evt", { summary: "renamed" });

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method).toBe("PATCH");
  });
});

/**
 * Note: zoom.ts caches the OAuth access token in a module-level variable
 * (keyed by time, not creds). The first test below populates that cache;
 * subsequent tests use `vi.useFakeTimers` to advance past the cache TTL so
 * the next `getZoomAccessToken()` triggers a fresh OAuth exchange.
 */
describe("integrations/zoom", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    clearEnv("ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET");
  });

  it("getZoomAccessToken exchanges S2S OAuth credentials for an access token", async () => {
    // Advance time so any token cached by previous tests has expired.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2099, 0, 1));

    setEnv("ZOOM_ACCOUNT_ID", "acct-1");
    setEnv("ZOOM_CLIENT_ID", "cid-1");
    setEnv("ZOOM_CLIENT_SECRET", "csec-1");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "zt_first", expires_in: 3600 }),
        { status: 200 },
      ),
    );

    const token = await getZoomAccessToken();
    expect(token).toBe("zt_first");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://zoom.us/oauth/token");
    expect(String(url)).toContain("account_credentials");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toMatch(/^Basic /);
  });

  it("createZoomMeeting POSTs to /users/me/meetings with the bearer token", async () => {
    vi.useFakeTimers();
    // Bump time forward 2 hours from any cached token's expiry.
    vi.setSystemTime(new Date(2099, 6, 1));

    setEnv("ZOOM_ACCOUNT_ID", "acct-2");
    setEnv("ZOOM_CLIENT_ID", "cid-2");
    setEnv("ZOOM_CLIENT_SECRET", "csec-2");

    const responses = [
      new Response(JSON.stringify({ access_token: "zt_2", expires_in: 3600 }), { status: 200 }),
      new Response(
        JSON.stringify({
          id: 88888,
          uuid: "u-1",
          topic: "Demo",
          start_time: "2026-02-01T15:00:00Z",
          duration: 30,
          timezone: "UTC",
          join_url: "https://zoom.us/j/88888",
          start_url: "https://zoom.us/s/88888",
        }),
        { status: 200 },
      ),
    ];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => responses.shift()!);

    const meeting = await createZoomMeeting({
      topic: "Demo",
      startTime: "2026-02-01T15:00:00Z",
      durationMinutes: 30,
    });

    expect(meeting.id).toBe(88888);
    expect(meeting.join_url).toContain("zoom.us");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toContain("/users/me/meetings");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer zt_2");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.type).toBe(2);
    expect(body.topic).toBe("Demo");
  });

  it("createZoomMeeting throws when token exchange fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2099, 11, 1));

    setEnv("ZOOM_ACCOUNT_ID", "acct-3");
    setEnv("ZOOM_CLIENT_ID", "cid-3");
    setEnv("ZOOM_CLIENT_SECRET", "csec-3");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid_grant", { status: 400 }),
    );

    await expect(
      createZoomMeeting({ topic: "x", startTime: "2026-02-01T15:00:00Z", durationMinutes: 30 }),
    ).rejects.toThrow(/Zoom token exchange failed/);
  });

  it("deleteZoomMeeting treats 404 as success", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2100, 0, 1));

    setEnv("ZOOM_ACCOUNT_ID", "acct-4");
    setEnv("ZOOM_CLIENT_ID", "cid-4");
    setEnv("ZOOM_CLIENT_SECRET", "csec-4");
    const responses = [
      new Response(JSON.stringify({ access_token: "zt_4", expires_in: 3600 }), { status: 200 }),
      new Response("not found", { status: 404 }),
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => responses.shift()!);

    await expect(deleteZoomMeeting(99)).resolves.toBeUndefined();
  });

  it("getZoomAccessToken throws when ZOOM_ACCOUNT_ID is unset (cache expired)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2100, 6, 1));

    clearEnv("ZOOM_ACCOUNT_ID");
    setEnv("ZOOM_CLIENT_ID", "x");
    setEnv("ZOOM_CLIENT_SECRET", "y");
    await expect(getZoomAccessToken()).rejects.toThrow(/ZOOM_ACCOUNT_ID/);
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

  it("sendTwilioSms POSTs to /Messages.json with Basic auth", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok-test");
    setEnv("TWILIO_FROM_NUMBER", "+15550100");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sid: "SMabc",
          status: "queued",
          to: "+15550199",
          from: "+15550100",
          body: "hi",
          date_created: "2026-02-01T15:00:00Z",
          num_segments: "1",
          price: null,
          error_code: null,
          error_message: null,
        }),
        { status: 201 },
      ),
    );

    const result = await sendTwilioSms({ to: "+15550199", body: "hi" });
    expect(result.sid).toBe("SMabc");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json",
    );
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toMatch(/^Basic /);
    const body = (init as RequestInit).body as string;
    expect(body).toContain("To=%2B15550199");
    expect(body).toContain("From=%2B15550100");
  });

  it("sendTwilioSms uses MessagingServiceSid when configured", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok-test");
    setEnv("TWILIO_MESSAGING_SERVICE_SID", "MGservice");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sid: "SMx",
          status: "queued",
          to: "+15550199",
          from: null,
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

    await sendTwilioSms({ to: "+15550199", body: "hi" });
    const body = (fetchMock.mock.calls[0]![1] as RequestInit).body as string;
    expect(body).toContain("MessagingServiceSid=MGservice");
    expect(body).not.toContain("From=");
  });

  it("sendTwilioSms throws on non-2xx", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok-test");
    setEnv("TWILIO_FROM_NUMBER", "+15550100");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid_to", { status: 400 }),
    );

    await expect(sendTwilioSms({ to: "+0", body: "hi" })).rejects.toThrow(/400/);
  });

  it("throws when TWILIO_ACCOUNT_SID is unset", async () => {
    clearEnv("TWILIO_ACCOUNT_SID");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    await expect(sendTwilioSms({ to: "+1", body: "hi" })).rejects.toThrow(
      /TWILIO_ACCOUNT_SID/,
    );
  });

  it("throws when neither TWILIO_FROM_NUMBER nor MessagingService is set", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok-test");
    clearEnv("TWILIO_FROM_NUMBER", "TWILIO_MESSAGING_SERVICE_SID");
    await expect(sendTwilioSms({ to: "+1", body: "hi" })).rejects.toThrow(
      /Twilio sender is not configured/,
    );
  });
});
