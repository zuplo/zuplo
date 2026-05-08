import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  createGCalEvent,
  deleteGCalEvent,
} from "../modules/integrations/google-calendar.ts";
import { sendTwilioSms } from "../modules/integrations/twilio.ts";
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

  it("createGCalEvent POSTs with bearer auth", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "evt", htmlLink: "https://x" }), { status: 200 }),
    );

    const e = await createGCalEvent({
      summary: "Showing",
      start: { dateTime: "2026-03-01T15:00:00Z" },
      end: { dateTime: "2026-03-01T15:30:00Z" },
    });

    expect(e.id).toBe("evt");
    const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
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
        start: { dateTime: "2026-03-01T15:00:00Z" },
        end: { dateTime: "2026-03-01T15:30:00Z" },
      }),
    ).rejects.toThrow(/403/);
  });

  it("createGCalEvent throws when token is unset", async () => {
    clearEnv("GOOGLE_CALENDAR_ACCESS_TOKEN");
    await expect(
      createGCalEvent({
        summary: "x",
        start: { dateTime: "2026-03-01T15:00:00Z" },
        end: { dateTime: "2026-03-01T15:30:00Z" },
      }),
    ).rejects.toThrow(/GOOGLE_CALENDAR_ACCESS_TOKEN/);
  });

  it("deleteGCalEvent treats 410 as success", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 410 }));
    await expect(deleteGCalEvent("evt")).resolves.toBeUndefined();
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

  it("POSTs to /Messages.json with Basic auth", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    setEnv("TWILIO_FROM_NUMBER", "+15550100");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sid: "SMtest",
          status: "queued",
          to: "+15550199",
          from: "+15550100",
          body: "x",
          date_created: "x",
          num_segments: "1",
          price: null,
          error_code: null,
          error_message: null,
        }),
        { status: 201 },
      ),
    );

    const r = await sendTwilioSms({ to: "+15550199", body: "hi" });
    expect(r.sid).toBe("SMtest");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json",
    );
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toMatch(/^Basic /);
  });

  it("throws on non-2xx", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    setEnv("TWILIO_FROM_NUMBER", "+15550100");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("invalid", { status: 400 }),
    );

    await expect(sendTwilioSms({ to: "+1", body: "x" })).rejects.toThrow(/400/);
  });

  it("throws when TWILIO_ACCOUNT_SID is unset", async () => {
    clearEnv("TWILIO_ACCOUNT_SID");
    await expect(sendTwilioSms({ to: "+1", body: "x" })).rejects.toThrow(
      /TWILIO_ACCOUNT_SID/,
    );
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
      new Response(JSON.stringify({ id: "id_a" }), { status: 200 }),
    );

    await sendResendEmail({ to: "x@y.com", subject: "hi" });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
  });

  it("throws on non-2xx", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(sendResendEmail({ to: "x@y.com", subject: "hi" })).rejects.toThrow(/500/);
  });

  it("throws when RESEND_API_KEY is unset", async () => {
    clearEnv("RESEND_API_KEY");
    await expect(sendResendEmail({ to: "x@y.com", subject: "hi" })).rejects.toThrow(
      /RESEND_API_KEY/,
    );
  });
});
