import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  createStripePaymentIntent,
  createStripeRefund,
  getStripePaymentIntent,
  verifyStripeWebhook,
} from "../modules/integrations/stripe.ts";
import {
  buildQrCodeUrl,
  renderTicketEmailHtml,
  sendResendEmail,
} from "../modules/integrations/resend.ts";

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


describe("integrations/stripe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("STRIPE_SECRET_KEY", undefined);
    setEnv("STRIPE_WEBHOOK_SECRET", undefined);
  });

  it("createStripePaymentIntent POSTs form-encoded body to /payment_intents", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test_123");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "pi_1",
          client_secret: "pi_1_secret",
          status: "requires_payment_method",
          amount: 5000,
          currency: "usd",
          metadata: { order_id: "ord-1" },
        }),
        { status: 200 },
      ),
    );

    const intent = await createStripePaymentIntent({
      amountCents: 5000,
      currency: "USD",
      description: "Ticket",
      receiptEmail: "buyer@example.com",
      metadata: { order_id: "ord-1", tenant_id: "tenant-a" },
    });
    expect(intent.id).toBe("pi_1");
    expect(intent.client_secret).toBe("pi_1_secret");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/payment_intents");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer sk_test_123");
    expect(headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    const params = new URLSearchParams((init as RequestInit).body as string);
    expect(params.get("amount")).toBe("5000");
    expect(params.get("currency")).toBe("usd");
    expect(params.get("receipt_email")).toBe("buyer@example.com");
    expect(params.get("automatic_payment_methods[enabled]")).toBe("true");
    expect(params.get("metadata[order_id]")).toBe("ord-1");
    expect(params.get("metadata[tenant_id]")).toBe("tenant-a");
  });

  it("createStripePaymentIntent throws on non-2xx", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("oops", { status: 400 }),
    );
    await expect(
      createStripePaymentIntent({ amountCents: 1, currency: "usd" }),
    ).rejects.toThrow(/Stripe PaymentIntent creation failed: 400/);
  });

  it("createStripePaymentIntent throws when STRIPE_SECRET_KEY is unset", async () => {
    setEnv("STRIPE_SECRET_KEY", undefined);
    await expect(
      createStripePaymentIntent({ amountCents: 1, currency: "usd" }),
    ).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });

  it("getStripePaymentIntent fetches by id with bearer", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_x");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "pi_1",
          client_secret: "x",
          status: "succeeded",
          amount: 100,
          currency: "usd",
          metadata: {},
        }),
        { status: 200 },
      ),
    );
    const out = await getStripePaymentIntent("pi_1");
    expect(out.status).toBe("succeeded");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/payment_intents/pi_1");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer sk_x");
  });

  it("getStripePaymentIntent throws on non-2xx", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 404 }),
    );
    await expect(getStripePaymentIntent("pi_x")).rejects.toThrow(
      /Stripe PaymentIntent fetch failed: 404/,
    );
  });

  it("createStripeRefund POSTs payment_intent + amount", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ id: "re_1", status: "succeeded", amount: 500 }),
        { status: 200 },
      ),
    );
    const out = await createStripeRefund({
      paymentIntent: "pi_1",
      amountCents: 500,
      reason: "requested_by_customer",
    });
    expect(out.id).toBe("re_1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/refunds");
    const params = new URLSearchParams((init as RequestInit).body as string);
    expect(params.get("payment_intent")).toBe("pi_1");
    expect(params.get("amount")).toBe("500");
    expect(params.get("reason")).toBe("requested_by_customer");
  });

  it("createStripeRefund throws on non-2xx", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("denied", { status: 402 }),
    );
    await expect(
      createStripeRefund({ paymentIntent: "pi_1" }),
    ).rejects.toThrow(/Stripe refund failed: 402/);
  });

  it("verifyStripeWebhook accepts a valid signature and returns parsed event", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_abc");
    const ts = Math.floor(Date.now() / 1000);
    const payload = {
      id: "evt_1",
      type: "payment_intent.succeeded",
      created: ts,
      data: { object: { id: "pi_1", metadata: {} } },
    };
    const raw = JSON.stringify(payload);
    const sig = await stripeSign(raw, "whsec_abc", ts);

    const event = await verifyStripeWebhook(raw, `t=${ts},v1=${sig}`);
    expect(event.id).toBe("evt_1");
    expect(event.type).toBe("payment_intent.succeeded");
  });

  it("verifyStripeWebhook rejects a tampered signature", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_abc");
    const ts = Math.floor(Date.now() / 1000);
    const raw = JSON.stringify({
      id: "evt_1",
      type: "x",
      created: ts,
      data: { object: { id: "pi_1" } },
    });
    const sig = await stripeSign(raw, "whsec_abc", ts);
    // Flip the first hex char to a different valid hex char.
    const flipped = sig[0] === "f" ? "0" : "f";
    const tampered = flipped + sig.slice(1);
    await expect(
      verifyStripeWebhook(raw, `t=${ts},v1=${tampered}`),
    ).rejects.toThrow(/Stripe signature mismatch/);
  });

  it("verifyStripeWebhook rejects a missing header", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_abc");
    await expect(verifyStripeWebhook("{}", null)).rejects.toThrow(
      /Missing Stripe-Signature header/,
    );
  });

  it("verifyStripeWebhook rejects an old timestamp outside tolerance", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_abc");
    const ts = Math.floor(Date.now() / 1000) - 1000;
    const raw = "{}";
    const sig = await stripeSign(raw, "whsec_abc", ts);
    await expect(
      verifyStripeWebhook(raw, `t=${ts},v1=${sig}`),
    ).rejects.toThrow(/timestamp outside tolerance/);
  });

  it("verifyStripeWebhook throws when STRIPE_WEBHOOK_SECRET unset", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", undefined);
    await expect(verifyStripeWebhook("{}", "t=1,v1=x")).rejects.toThrow(
      /STRIPE_WEBHOOK_SECRET/,
    );
  });
});

describe("integrations/resend", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("RESEND_API_KEY", undefined);
  });

  it("sendResendEmail POSTs to /emails with bearer auth and reply_to mapping", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "em_1" }), { status: 200 }),
    );

    const out = await sendResendEmail({
      to: "buyer@example.com",
      from: "tickets@kit.test",
      subject: "Your ticket",
      html: "<p>hi</p>",
      replyTo: "support@kit.test",
    });
    expect(out.id).toBe("em_1");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe("buyer@example.com");
    expect(body.from).toBe("tickets@kit.test");
    expect(body.subject).toBe("Your ticket");
    expect(body.reply_to).toBe("support@kit.test");
  });

  it("sendResendEmail throws on non-2xx", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    await expect(
      sendResendEmail({ to: "x", from: "y", subject: "z" }),
    ).rejects.toThrow(/Resend send failed: 403/);
  });

  it("sendResendEmail throws when RESEND_API_KEY is unset", async () => {
    setEnv("RESEND_API_KEY", undefined);
    await expect(
      sendResendEmail({ to: "x", from: "y", subject: "z" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("buildQrCodeUrl encodes the payload", () => {
    const url = buildQrCodeUrl("ord_1.abc def");
    expect(url).toContain("https://api.qrserver.com/v1/create-qr-code/");
    expect(url).toContain("data=ord_1.abc%20def");
  });

  it("renderTicketEmailHtml escapes user content", () => {
    const html = renderTicketEmailHtml({
      attendeeName: '<b>Alice</b>',
      eventName: "Show & Tell",
      startsAt: "2025-12-01",
      venue: "Hall",
      qrPayload: "abc",
    });
    expect(html).toContain("&lt;b&gt;Alice&lt;/b&gt;");
    expect(html).toContain("Show &amp; Tell");
    expect(html).toContain("abc");
  });
});
