import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  createGCalEvent,
  deleteGCalEvent,
} from "../modules/integrations/google-calendar.ts";
import { sendResendEmail } from "../modules/integrations/resend.ts";

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
          id: "evt_lesson",
          htmlLink: "https://cal.google/x",
          hangoutLink: "https://meet.google/abc",
        }),
        { status: 200 },
      ),
    );

    const e = await createGCalEvent({
      summary: "Algebra 101 — Week 1",
      start: { dateTime: "2026-09-01T15:00:00Z" },
      end: { dateTime: "2026-09-01T16:00:00Z" },
      attendees: [{ email: "student@example.com" }],
    });

    expect(e.id).toBe("evt_lesson");
    expect(e.hangoutLink).toContain("meet.google");
    const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer ya29.test");
  });

  it("createGCalEvent passes conferenceDataVersion=1 when conferenceData is supplied", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "evt", htmlLink: "" }), { status: 200 }),
    );

    await createGCalEvent({
      summary: "x",
      start: { dateTime: "2026-09-01T15:00:00Z" },
      end: { dateTime: "2026-09-01T16:00:00Z" },
      conferenceData: {
        createRequest: {
          requestId: "abc",
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("conferenceDataVersion=1");
  });

  it("createGCalEvent throws on non-2xx", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );

    await expect(
      createGCalEvent({
        summary: "x",
        start: { dateTime: "2026-09-01T15:00:00Z" },
        end: { dateTime: "2026-09-01T16:00:00Z" },
      }),
    ).rejects.toThrow(/403/);
  });

  it("createGCalEvent throws when GOOGLE_CALENDAR_ACCESS_TOKEN is unset", async () => {
    clearEnv("GOOGLE_CALENDAR_ACCESS_TOKEN");
    await expect(
      createGCalEvent({
        summary: "x",
        start: { dateTime: "2026-09-01T15:00:00Z" },
        end: { dateTime: "2026-09-01T16:00:00Z" },
      }),
    ).rejects.toThrow(/GOOGLE_CALENDAR_ACCESS_TOKEN/);
  });

  it("deleteGCalEvent treats 410 as success", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 410 }));
    await expect(deleteGCalEvent("evt_x")).resolves.toBeUndefined();
  });
});

describe("integrations/resend", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RESEND_API_KEY", "RESEND_FROM_EMAIL");
  });

  it("POSTs to /emails with bearer auth", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "re_pr" }), { status: 200 }),
    );

    const r = await sendResendEmail({
      to: "parent@example.com",
      subject: "Progress",
      text: "x",
    });
    expect(r.id).toBe("re_pr");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
  });

  it("forwards Idempotency-Key header when supplied", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "id_a" }), { status: 200 }),
    );

    await sendResendEmail({
      to: "x@y.com",
      subject: "hi",
      idempotencyKey: "progress-2026-09-01",
    });
    const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get("idempotency-key")).toBe("progress-2026-09-01");
  });

  it("throws on non-2xx", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      sendResendEmail({ to: "x@y.com", subject: "hi" }),
    ).rejects.toThrow(/500/);
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
