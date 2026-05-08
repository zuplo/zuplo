import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  createStripeCheckoutSession,
  verifyStripeWebhook,
} from "../modules/integrations/stripe.ts";
import { sendTwilioSms } from "../modules/integrations/twilio.ts";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "../modules/integrations/google-calendar.ts";

async function stripeSign(body: string, secret: string, ts: number): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${body}`));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const env = environment as Record<string, string | undefined>;

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete env[name];
    delete process.env[name];
  } else {
    env[name] = value;
    process.env[name] = value;
  }
}


describe("integrations/stripe (Checkout + verify)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("STRIPE_SECRET_KEY", undefined);
    setEnv("STRIPE_WEBHOOK_SECRET", undefined);
  });

  it("createStripeCheckoutSession POSTs form-encoded body with line_items + metadata", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "cs_1",
          url: "https://checkout.stripe.com/c/cs_1",
          payment_intent: null,
          payment_status: "unpaid",
          status: "open",
          metadata: { reservation_id: "r1" },
        }),
        { status: 200 },
      ),
    );
    const out = await createStripeCheckoutSession({
      amountCents: 2500,
      currency: "USD",
      description: "Reservation deposit",
      customerEmail: "guest@example.com",
      successUrl: "https://kit.test/ok",
      cancelUrl: "https://kit.test/cancel",
      metadata: { reservation_id: "r1", tenant_id: "tenant-a" },
    });
    expect(out.id).toBe("cs_1");
    expect(out.url).toContain("checkout.stripe.com");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer sk_test_x");
    expect(headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    const params = new URLSearchParams((init as RequestInit).body as string);
    expect(params.get("mode")).toBe("payment");
    expect(params.get("success_url")).toBe("https://kit.test/ok");
    expect(params.get("cancel_url")).toBe("https://kit.test/cancel");
    expect(params.get("customer_email")).toBe("guest@example.com");
    expect(params.get("line_items[0][quantity]")).toBe("1");
    expect(params.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(params.get("line_items[0][price_data][unit_amount]")).toBe("2500");
    expect(params.get("line_items[0][price_data][product_data][name]")).toBe(
      "Reservation deposit",
    );
    // Metadata is stamped both on session and on the underlying PaymentIntent.
    expect(params.get("metadata[reservation_id]")).toBe("r1");
    expect(params.get("metadata[tenant_id]")).toBe("tenant-a");
    expect(params.get("payment_intent_data[metadata][reservation_id]")).toBe(
      "r1",
    );
  });

  it("createStripeCheckoutSession throws on non-2xx", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 400 }),
    );
    await expect(
      createStripeCheckoutSession({
        amountCents: 1,
        currency: "USD",
        description: "x",
        customerEmail: "g@e.com",
        successUrl: "x",
        cancelUrl: "x",
      }),
    ).rejects.toThrow(/Stripe Checkout Session creation failed: 400/);
  });

  it("createStripeCheckoutSession throws when STRIPE_SECRET_KEY is unset", async () => {
    setEnv("STRIPE_SECRET_KEY", undefined);
    await expect(
      createStripeCheckoutSession({
        amountCents: 1,
        currency: "USD",
        description: "x",
        customerEmail: "g@e.com",
        successUrl: "x",
        cancelUrl: "x",
      }),
    ).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });

  it("verifyStripeWebhook accepts valid signature and parses event", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    const ts = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      created: ts,
      data: { object: { id: "cs_1", metadata: {} } },
    });
    const sig = await stripeSign(payload, "whsec_x", ts);
    const event = await verifyStripeWebhook(payload, `t=${ts},v1=${sig}`);
    expect(event.type).toBe("checkout.session.completed");
  });

  it("verifyStripeWebhook rejects bad sig", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    const ts = Math.floor(Date.now() / 1000);
    await expect(
      verifyStripeWebhook("{}", `t=${ts},v1=BADSIG`),
    ).rejects.toThrow();
  });

  it("verifyStripeWebhook throws when STRIPE_WEBHOOK_SECRET unset", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", undefined);
    await expect(verifyStripeWebhook("{}", "t=1,v1=x")).rejects.toThrow(
      /STRIPE_WEBHOOK_SECRET/,
    );
  });
});

describe("integrations/twilio", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("TWILIO_ACCOUNT_SID", undefined);
    setEnv("TWILIO_AUTH_TOKEN", undefined);
    setEnv("TWILIO_FROM_NUMBER", undefined);
  });

  it("sendTwilioSms POSTs form-encoded with Basic auth", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    setEnv("TWILIO_FROM_NUMBER", "+15555550100");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sid: "SM1",
          status: "queued",
          to: "+1",
          from: "+15555550100",
          body: "x",
          date_created: "x",
        }),
        { status: 201 },
      ),
    );
    const out = await sendTwilioSms({ to: "+15555550101", body: "Confirmed" });
    expect(out.sid).toBe("SM1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json",
    );
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe(
      `Basic ${btoa("ACtest:tok")}`,
    );
    const params = new URLSearchParams((init as RequestInit).body as string);
    expect(params.get("To")).toBe("+15555550101");
    expect(params.get("From")).toBe("+15555550100");
    expect(params.get("Body")).toBe("Confirmed");
  });

  it("sendTwilioSms throws on non-2xx", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "AC");
    setEnv("TWILIO_AUTH_TOKEN", "T");
    setEnv("TWILIO_FROM_NUMBER", "+1");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("denied", { status: 403 }),
    );
    await expect(
      sendTwilioSms({ to: "+1", body: "x" }),
    ).rejects.toThrow(/Twilio SMS send failed: 403/);
  });

  it("throws when TWILIO_ACCOUNT_SID is unset", async () => {
    setEnv("TWILIO_ACCOUNT_SID", undefined);
    setEnv("TWILIO_AUTH_TOKEN", "T");
    setEnv("TWILIO_FROM_NUMBER", "+1");
    await expect(sendTwilioSms({ to: "+1", body: "x" })).rejects.toThrow(
      /TWILIO_ACCOUNT_SID/,
    );
  });
});

describe("integrations/google-calendar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("GOOGLE_ACCESS_TOKEN", undefined);
  });

  it("createGoogleCalendarEvent POSTs to events with bearer", async () => {
    setEnv("GOOGLE_ACCESS_TOKEN", "ya29.token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "evt-1",
          status: "confirmed",
          htmlLink: "https://cal/x",
          start: { dateTime: "2026-08-12T19:00:00-07:00" },
          end: { dateTime: "2026-08-12T20:30:00-07:00" },
          summary: "Booking",
        }),
        { status: 200 },
      ),
    );
    const out = await createGoogleCalendarEvent({
      calendarId: "primary",
      summary: "Booking",
      start: "2026-08-12T19:00:00-07:00",
      end: "2026-08-12T20:30:00-07:00",
      timeZone: "America/Los_Angeles",
      attendees: [{ email: "g@e.com", displayName: "G" }],
      extendedProperties: { private: { reservationId: "r1" } },
    });
    expect(out.id).toBe("evt-1");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer ya29.token");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.summary).toBe("Booking");
    expect(body.start.dateTime).toBe("2026-08-12T19:00:00-07:00");
    expect(body.start.timeZone).toBe("America/Los_Angeles");
    expect(body.attendees).toHaveLength(1);
    expect(body.extendedProperties.private.reservationId).toBe("r1");
  });

  it("createGoogleCalendarEvent throws on non-2xx", async () => {
    setEnv("GOOGLE_ACCESS_TOKEN", "y");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("denied", { status: 403 }),
    );
    await expect(
      createGoogleCalendarEvent({
        calendarId: "x",
        summary: "x",
        start: "x",
        end: "x",
      }),
    ).rejects.toThrow(/Google Calendar event creation failed: 403/);
  });

  it("deleteGoogleCalendarEvent DELETEs the event", async () => {
    setEnv("GOOGLE_ACCESS_TOKEN", "y");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    await deleteGoogleCalendarEvent("primary", "evt-1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events/evt-1",
    );
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("deleteGoogleCalendarEvent tolerates 404/410 (already gone)", async () => {
    setEnv("GOOGLE_ACCESS_TOKEN", "y");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("gone", { status: 410 }),
    );
    await expect(
      deleteGoogleCalendarEvent("primary", "evt-1"),
    ).resolves.toBeUndefined();
  });

  it("deleteGoogleCalendarEvent throws on 5xx", async () => {
    setEnv("GOOGLE_ACCESS_TOKEN", "y");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      deleteGoogleCalendarEvent("primary", "evt-1"),
    ).rejects.toThrow(/Google Calendar event delete failed: 500/);
  });

  it("createGoogleCalendarEvent throws when GOOGLE_ACCESS_TOKEN is unset", async () => {
    setEnv("GOOGLE_ACCESS_TOKEN", undefined);
    await expect(
      createGoogleCalendarEvent({
        calendarId: "x",
        summary: "x",
        start: "x",
        end: "x",
      }),
    ).rejects.toThrow(/GOOGLE_ACCESS_TOKEN/);
  });
});
