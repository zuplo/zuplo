import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { sendResendEmail, defaultFrom } from "../modules/integrations/resend.ts";
import {
  upsertStripeCustomer,
  createAndSendStripeInvoice,
  retrieveCharge,
  verifyStripeSignature,
} from "../modules/integrations/stripe.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

describe("integrations/resend", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RESEND_API_KEY");
    clearEnv("RESEND_FROM_EMAIL");
  });

  it("POSTs to /emails with bearer auth and JSON body", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "email_123" }), { status: 200 }),
      );

    const result = await sendResendEmail({
      to: "to@example.com",
      from: "from@example.com",
      subject: "Hello",
      text: "body",
      tags: [{ name: "kit", value: "invoicing" }],
    });

    expect(result.id).toBe("email_123");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe("to@example.com");
    expect(body.from).toBe("from@example.com");
    expect(body.subject).toBe("Hello");
    expect(body.text).toBe("body");
    expect(body.tags).toEqual([{ name: "kit", value: "invoicing" }]);
  });

  it("throws on non-2xx response", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    await expect(
      sendResendEmail({ to: "x@y.com", from: "h@z.com", subject: "z" }),
    ).rejects.toThrow(/Resend send failed/);
  });

  it("throws when RESEND_API_KEY is unset", async () => {
    clearEnv("RESEND_API_KEY");
    await expect(
      sendResendEmail({ to: "x@y.com", from: "h@z.com", subject: "z" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("defaultFrom returns env var or placeholder", () => {
    setEnv("RESEND_FROM_EMAIL", "billing@acme.com");
    expect(defaultFrom()).toBe("billing@acme.com");
    clearEnv("RESEND_FROM_EMAIL");
    expect(defaultFrom()).toBe("billing@example.com");
  });
});

describe("integrations/stripe — upsertStripeCustomer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_SECRET_KEY");
  });

  it("returns the existing customer when search has results", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test_123");
    const existing = {
      id: "cus_existing",
      email: "x@y.com",
      name: "X",
      metadata: { tenant_customer_id: "cust_1" },
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [existing] }), { status: 200 }),
      );

    const result = await upsertStripeCustomer({
      email: "x@y.com",
      name: "X",
      tenantCustomerId: "cust_1",
    });
    expect(result).toEqual(existing);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://api.stripe.com/v1/customers/search");
    expect(String(url)).toContain("tenant_customer_id");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer sk_test_123");
  });

  it("creates a new customer when search is empty", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test_123");
    const created = {
      id: "cus_new",
      email: "y@z.com",
      name: "Y",
      metadata: { tenant_customer_id: "cust_2" },
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 200 }));

    const result = await upsertStripeCustomer({
      email: "y@z.com",
      name: "Y",
      tenantCustomerId: "cust_2",
    });
    expect(result).toEqual(created);
    const [, createInit] = fetchMock.mock.calls[1]!;
    expect((createInit as RequestInit).method).toBe("POST");
    const body = String((createInit as RequestInit).body);
    expect(body).toContain("email=y%40z.com");
    expect(body).toContain("name=Y");
    expect(body).toContain("metadata%5Btenant_customer_id%5D=cust_2");
    const headers = new Headers((createInit as RequestInit).headers);
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
  });

  it("throws when search request fails", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 401 }),
    );
    await expect(
      upsertStripeCustomer({ email: "a@b", name: "A", tenantCustomerId: "x" }),
    ).rejects.toThrow(/Stripe GET .* failed/);
  });

  it("throws when STRIPE_SECRET_KEY is unset", async () => {
    clearEnv("STRIPE_SECRET_KEY");
    await expect(
      upsertStripeCustomer({ email: "a@b", name: "A", tenantCustomerId: "x" }),
    ).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });
});

describe("integrations/stripe — createAndSendStripeInvoice", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_SECRET_KEY");
  });

  it("creates an item, invoice, finalizes, and sends", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test_123");
    const stripeInvoice = {
      id: "in_1",
      customer: "cus_1",
      status: "open",
      amount_due: 5000,
      amount_paid: 0,
      currency: "usd",
      hosted_invoice_url: "https://stripe.test/i/in_1",
      invoice_pdf: null,
      metadata: {},
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "ii_1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(stripeInvoice), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(stripeInvoice), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(stripeInvoice), { status: 200 }));

    const result = await createAndSendStripeInvoice({
      stripeCustomerId: "cus_1",
      amountCents: 5000,
      currency: "usd",
      description: "Invoice 100",
      daysUntilDue: 7,
      metadata: { tenant_invoice_id: "inv_local_1" },
    });

    expect(result).toEqual(stripeInvoice);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/invoiceitems");
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/invoices");
    expect(String(fetchMock.mock.calls[2]![0])).toContain(`/invoices/${stripeInvoice.id}/finalize`);
    expect(String(fetchMock.mock.calls[3]![0])).toContain(`/invoices/${stripeInvoice.id}/send`);
    const itemBody = String((fetchMock.mock.calls[0]![1] as RequestInit).body);
    expect(itemBody).toContain("customer=cus_1");
    expect(itemBody).toContain("amount=5000");
    expect(itemBody).toContain("currency=usd");
  });

  it("throws when invoiceitems creation fails", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad", { status: 500 }),
    );
    await expect(
      createAndSendStripeInvoice({
        stripeCustomerId: "cus_1",
        amountCents: 100,
        currency: "usd",
        description: "x",
        daysUntilDue: 7,
      }),
    ).rejects.toThrow(/Stripe POST/);
  });

  it("throws when STRIPE_SECRET_KEY is unset", async () => {
    clearEnv("STRIPE_SECRET_KEY");
    await expect(
      createAndSendStripeInvoice({
        stripeCustomerId: "c",
        amountCents: 1,
        currency: "usd",
        description: "x",
        daysUntilDue: 1,
      }),
    ).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });
});

describe("integrations/stripe — retrieveCharge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_SECRET_KEY");
  });

  it("GETs /charges/:id and returns the parsed body", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test_123");
    const charge = { id: "ch_1", amount: 100, currency: "usd", paid: true, status: "succeeded", metadata: {} };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(charge), { status: 200 }));
    const result = await retrieveCharge("ch_1");
    expect(result).toEqual(charge);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.stripe.com/v1/charges/ch_1",
    );
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("GET");
  });

  it("throws on non-2xx response", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 404 }));
    await expect(retrieveCharge("ch_missing")).rejects.toThrow(/Stripe GET/);
  });

  it("throws when STRIPE_SECRET_KEY is unset", async () => {
    clearEnv("STRIPE_SECRET_KEY");
    await expect(retrieveCharge("ch_1")).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });
});

describe("integrations/stripe — verifyStripeSignature", () => {
  afterEach(() => {
    clearEnv("STRIPE_WEBHOOK_SECRET");
  });

  async function computeV1(secret: string, ts: string, raw: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${raw}`));
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  it("returns true for a valid timestamp + v1 signature", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const raw = JSON.stringify({ id: "evt_1", type: "x" });
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = await computeV1("whsec_test", ts, raw);
    const valid = await verifyStripeSignature({
      rawBody: raw,
      signatureHeader: `t=${ts},v1=${v1}`,
    });
    expect(valid).toBe(true);
  });

  it("returns false for a tampered body", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const raw = "{}";
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = await computeV1("whsec_test", ts, raw);
    const valid = await verifyStripeSignature({
      rawBody: '{"tampered":true}',
      signatureHeader: `t=${ts},v1=${v1}`,
    });
    expect(valid).toBe(false);
  });

  it("returns false when timestamp is outside the tolerance", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const raw = "{}";
    const oldTs = String(Math.floor(Date.now() / 1000) - 10_000);
    const v1 = await computeV1("whsec_test", oldTs, raw);
    const valid = await verifyStripeSignature({
      rawBody: raw,
      signatureHeader: `t=${oldTs},v1=${v1}`,
    });
    expect(valid).toBe(false);
  });

  it("returns false on malformed header", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    expect(
      await verifyStripeSignature({ rawBody: "{}", signatureHeader: "garbage" }),
    ).toBe(false);
  });

  it("throws when STRIPE_WEBHOOK_SECRET is unset", async () => {
    clearEnv("STRIPE_WEBHOOK_SECRET");
    await expect(
      verifyStripeSignature({
        rawBody: "{}",
        signatureHeader: "t=1,v1=abc",
      }),
    ).rejects.toThrow(/STRIPE_WEBHOOK_SECRET/);
  });
});
