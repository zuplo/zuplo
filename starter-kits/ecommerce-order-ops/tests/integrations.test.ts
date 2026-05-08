import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { verifyStripeWebhook } from "../modules/integrations/stripe.ts";
import {
  getShipEngineRates,
  purchaseShipEngineLabel,
  getShipEngineTracking,
} from "../modules/integrations/shipengine.ts";
import { sendTwilioSms } from "../modules/integrations/twilio.ts";

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


describe("integrations/stripe (verify only)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("STRIPE_WEBHOOK_SECRET", undefined);
  });

  it("verifyStripeWebhook accepts a valid signature", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    const ts = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      id: "evt_1",
      type: "payment_intent.succeeded",
      created: ts,
      data: { object: { id: "pi_1", metadata: {} } },
    });
    const sig = await stripeSign(payload, "whsec_x", ts);
    const event = await verifyStripeWebhook(payload, `t=${ts},v1=${sig}`);
    expect(event.type).toBe("payment_intent.succeeded");
  });

  it("verifyStripeWebhook rejects on bad signature", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    const ts = Math.floor(Date.now() / 1000);
    await expect(
      verifyStripeWebhook("{}", `t=${ts},v1=DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF`),
    ).rejects.toThrow();
  });

  it("verifyStripeWebhook throws when STRIPE_WEBHOOK_SECRET is unset", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", undefined);
    await expect(verifyStripeWebhook("{}", "t=1,v1=x")).rejects.toThrow(
      /STRIPE_WEBHOOK_SECRET/,
    );
  });
});

describe("integrations/shipengine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("SHIPENGINE_API_KEY", undefined);
  });

  it("getShipEngineRates POSTs to /rates with api-key header and shipment body", async () => {
    setEnv("SHIPENGINE_API_KEY", "se_key_xx");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          rate_response: {
            rates: [
              {
                rate_id: "r1",
                carrier_id: "c1",
                carrier_friendly_name: "USPS",
                service_type: "Priority",
                service_code: "usps_priority",
                shipping_amount: { amount: 8.5, currency: "USD" },
                estimated_delivery_date: null,
                delivery_days: 2,
                trackable: true,
              },
            ],
            invalid_rates: [],
            rate_request_id: "req-1",
            shipment_id: "sh-1",
            created_at: "2025-12-01T00:00:00Z",
            status: "completed",
          },
        }),
        { status: 200 },
      ),
    );

    const rates = await getShipEngineRates({
      shipFrom: {
        name: "WH",
        addressLine1: "1 Main",
        cityLocality: "Reno",
        stateProvince: "NV",
        postalCode: "89501",
        countryCode: "US",
      },
      shipTo: {
        name: "Buyer",
        addressLine1: "100 Pine",
        cityLocality: "Seattle",
        stateProvince: "WA",
        postalCode: "98101",
        countryCode: "US",
      },
      parcel: { weightOz: 16 },
      carrierIds: ["c1"],
    });
    expect(rates).toHaveLength(1);
    expect(rates[0].rate_id).toBe("r1");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.shipengine.com/v1/rates");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("api-key")).toBe("se_key_xx");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.rate_options.carrier_ids).toEqual(["c1"]);
    expect(body.shipment.ship_to.address_line1).toBe("100 Pine");
    expect(body.shipment.ship_from.city_locality).toBe("Reno");
    expect(body.shipment.packages[0].weight).toEqual({ value: 16, unit: "ounce" });
  });

  it("getShipEngineRates throws on non-2xx", async () => {
    setEnv("SHIPENGINE_API_KEY", "x");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    await expect(
      getShipEngineRates({
        shipFrom: {
          name: "a",
          addressLine1: "a",
          cityLocality: "a",
          stateProvince: "a",
          postalCode: "a",
          countryCode: "US",
        },
        shipTo: {
          name: "a",
          addressLine1: "a",
          cityLocality: "a",
          stateProvince: "a",
          postalCode: "a",
          countryCode: "US",
        },
        parcel: { weightOz: 1 },
      }),
    ).rejects.toThrow(/ShipEngine rate shop failed: 500/);
  });

  it("purchaseShipEngineLabel uses /labels/rates/{rateId} when rateId is provided", async () => {
    setEnv("SHIPENGINE_API_KEY", "x");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          label_id: "lbl_1",
          status: "completed",
          shipment_id: "sh_1",
          ship_date: "2025-12-01",
          created_at: "2025-12-01T00:00:00Z",
          shipment_cost: { amount: 8.5, currency: "USD" },
          insurance_cost: { amount: 0, currency: "USD" },
          tracking_number: "1Z123",
          tracking_status: "in_transit",
          carrier_code: "usps",
          service_code: "usps_priority",
          label_download: { href: "https://x/y.pdf" },
        }),
        { status: 200 },
      ),
    );
    const out = await purchaseShipEngineLabel({ rateId: "r1", testLabel: true });
    expect(out.label_id).toBe("lbl_1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.shipengine.com/v1/labels/rates/r1");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.test_label).toBe(true);
  });

  it("purchaseShipEngineLabel throws on non-2xx", async () => {
    setEnv("SHIPENGINE_API_KEY", "x");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 400 }),
    );
    await expect(
      purchaseShipEngineLabel({ rateId: "r1" }),
    ).rejects.toThrow(/ShipEngine label purchase failed: 400/);
  });

  it("purchaseShipEngineLabel without rateId requires shipFrom/shipTo/parcel/serviceCode", async () => {
    setEnv("SHIPENGINE_API_KEY", "x");
    await expect(purchaseShipEngineLabel({})).rejects.toThrow(
      /Either rateId or/,
    );
  });

  it("getShipEngineTracking GETs /tracking with carrier_code and tracking_number", async () => {
    setEnv("SHIPENGINE_API_KEY", "x");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tracking_number: "1Z123",
          status_code: "DE",
          status_description: "Delivered",
          events: [],
        }),
        { status: 200 },
      ),
    );
    const out = await getShipEngineTracking("usps", "1Z123");
    expect(out.status_code).toBe("DE");
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.shipengine.com/v1/tracking?carrier_code=usps&tracking_number=1Z123",
    );
  });

  it("throws when SHIPENGINE_API_KEY is unset", async () => {
    setEnv("SHIPENGINE_API_KEY", undefined);
    await expect(
      getShipEngineRates({
        shipFrom: {
          name: "a",
          addressLine1: "a",
          cityLocality: "a",
          stateProvince: "a",
          postalCode: "a",
          countryCode: "US",
        },
        shipTo: {
          name: "a",
          addressLine1: "a",
          cityLocality: "a",
          stateProvince: "a",
          postalCode: "a",
          countryCode: "US",
        },
        parcel: { weightOz: 1 },
      }),
    ).rejects.toThrow(/SHIPENGINE_API_KEY/);
  });
});

describe("integrations/twilio", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("TWILIO_ACCOUNT_SID", undefined);
    setEnv("TWILIO_AUTH_TOKEN", undefined);
    setEnv("TWILIO_FROM_NUMBER", undefined);
  });

  it("sendTwilioSms POSTs form-encoded body with Basic auth", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    setEnv("TWILIO_FROM_NUMBER", "+15555550100");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sid: "SM1",
          status: "queued",
          to: "+15555550101",
          from: "+15555550100",
          body: "hi",
          date_created: "x",
          date_updated: "x",
          num_segments: "1",
        }),
        { status: 201 },
      ),
    );
    const out = await sendTwilioSms({
      to: "+15555550101",
      body: "Your shipment is out for delivery",
    });
    expect(out.sid).toBe("SM1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json",
    );
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe(
      `Basic ${btoa("ACtest:tok")}`,
    );
    expect(headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    const params = new URLSearchParams((init as RequestInit).body as string);
    expect(params.get("To")).toBe("+15555550101");
    expect(params.get("From")).toBe("+15555550100");
    expect(params.get("Body")).toBe("Your shipment is out for delivery");
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

  it("throws when TWILIO_FROM_NUMBER is unset", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "AC");
    setEnv("TWILIO_AUTH_TOKEN", "T");
    setEnv("TWILIO_FROM_NUMBER", undefined);
    await expect(sendTwilioSms({ to: "+1", body: "x" })).rejects.toThrow(
      /TWILIO_FROM_NUMBER/,
    );
  });
});
