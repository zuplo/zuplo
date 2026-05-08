import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendResendEmail } from "../modules/integrations/resend.ts";
import {
  createDocusignEnvelope,
  verifyDocusignWebhook,
} from "../modules/integrations/docusign.ts";
import {
  addStripeInvoiceItem,
  createAndFinalizeStripeInvoice,
  getOrCreateStripeCustomer,
  verifyStripeWebhook,
} from "../modules/integrations/stripe.ts";

describe("integrations/resend", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "quotes@example.com";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it("POSTs to /emails with bearer auth", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "msg_q" }), { status: 200 }),
      );
    const result = await sendResendEmail({
      to: "buyer@x.com",
      subject: "Your quote",
      text: "ready",
    });
    expect(result.id).toBe("msg_q");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
  });

  it("throws on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      sendResendEmail({ to: "x", subject: "y" }),
    ).rejects.toThrow(/Resend send failed: 500/);
  });

  it("throws when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(
      sendResendEmail({ to: "x", subject: "y" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});

describe("integrations/docusign", () => {
  beforeEach(() => {
    process.env.DOCUSIGN_BASE_URL = "https://demo.docusign.net";
    process.env.DOCUSIGN_ACCOUNT_ID = "acct-123";
    process.env.DOCUSIGN_ACCESS_TOKEN = "ds-token";
    process.env.DOCUSIGN_WEBHOOK_HMAC_KEY = "ds-hmac";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DOCUSIGN_BASE_URL;
    delete process.env.DOCUSIGN_ACCOUNT_ID;
    delete process.env.DOCUSIGN_ACCESS_TOKEN;
    delete process.env.DOCUSIGN_WEBHOOK_HMAC_KEY;
  });

  it("createDocusignEnvelope POSTs envelope with quote custom field", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          envelopeId: "env-1",
          uri: "/envelopes/env-1",
          status: "sent",
          statusDateTime: "2026-04-01T00:00:00Z",
        }),
        { status: 201 },
      ),
    );
    const env = await createDocusignEnvelope({
      emailSubject: "Sign please",
      documents: [
        {
          documentBase64: "QUJD",
          name: "Quote.pdf",
          fileExtension: "pdf",
          documentId: "1",
        },
      ],
      signers: [{ email: "buyer@x.com", name: "Buyer Person" }],
      quoteId: "q-123",
    });
    expect(env.envelopeId).toBe("env-1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://demo.docusign.net/restapi/v2.1/accounts/acct-123/envelopes",
    );
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer ds-token");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.emailSubject).toBe("Sign please");
    expect(body.recipients.signers).toHaveLength(1);
    expect(body.recipients.signers[0].recipientId).toBe("1");
    expect(body.customFields.textCustomFields[0].name).toBe("quoteId");
    expect(body.customFields.textCustomFields[0].value).toBe("q-123");
  });

  it("createDocusignEnvelope throws on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    await expect(
      createDocusignEnvelope({
        emailSubject: "x",
        documents: [
          {
            documentBase64: "QUJD",
            name: "f.pdf",
            documentId: "1",
          },
        ],
        signers: [{ email: "x@y.com", name: "Y" }],
        quoteId: "q",
      }),
    ).rejects.toThrow(/DocuSign envelope create failed: 403/);
  });

  it("createDocusignEnvelope throws when DOCUSIGN_ACCESS_TOKEN unset", async () => {
    delete process.env.DOCUSIGN_ACCESS_TOKEN;
    await expect(
      createDocusignEnvelope({
        emailSubject: "x",
        documents: [
          { documentBase64: "QUJD", name: "f.pdf", documentId: "1" },
        ],
        signers: [{ email: "x@y.com", name: "Y" }],
        quoteId: "q",
      }),
    ).rejects.toThrow(/DOCUSIGN_ACCESS_TOKEN/);
  });

  it("verifyDocusignWebhook accepts a correct base64 HMAC", async () => {
    const body = `{"event":"envelope-completed"}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode("ds-hmac"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
    const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
    expect(await verifyDocusignWebhook(body, expectedB64)).toBe(true);
  });

  it("verifyDocusignWebhook rejects a tampered signature", async () => {
    expect(await verifyDocusignWebhook("body", "AAAA")).toBe(false);
  });

  it("verifyDocusignWebhook throws when DOCUSIGN_WEBHOOK_HMAC_KEY is unset", async () => {
    delete process.env.DOCUSIGN_WEBHOOK_HMAC_KEY;
    await expect(verifyDocusignWebhook("x", "y")).rejects.toThrow(
      /DOCUSIGN_WEBHOOK_HMAC_KEY/,
    );
  });
});

describe("integrations/stripe", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_WEBHOOK_SIGNING_SECRET = "whsec_test";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
  });

  it("getOrCreateStripeCustomer searches first, returns existing", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ id: "cus_1", email: "buyer@x.com", name: "Buyer" }],
          }),
          { status: 200 },
        ),
      );
    const customer = await getOrCreateStripeCustomer("buyer@x.com");
    expect(customer.id).toBe("cus_1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/customers/search?query=");
    expect(String(url)).toContain("buyer%40x.com");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer sk_test_x");
  });

  it("getOrCreateStripeCustomer creates when search returns empty", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "cus_new", email: "buyer@x.com", name: "B" }),
          { status: 200 },
        ),
      );
    const customer = await getOrCreateStripeCustomer("buyer@x.com", "B");
    expect(customer.id).toBe("cus_new");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[1]!;
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect((init as RequestInit).body).toContain("email=buyer%40x.com");
    expect((init as RequestInit).body).toContain("name=B");
  });

  it("getOrCreateStripeCustomer throws when create fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("bad", { status: 400 }));
    await expect(getOrCreateStripeCustomer("buyer@x.com")).rejects.toThrow(
      /Stripe customer create failed: 400/,
    );
  });

  it("addStripeInvoiceItem POSTs form-encoded body", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "ii_1" }), { status: 200 }),
      );
    const item = await addStripeInvoiceItem(
      "cus_1",
      5000,
      "usd",
      "Item description",
    );
    expect(item.id).toBe("ii_1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.stripe.com/v1/invoiceitems");
    expect((init as RequestInit).body).toContain("customer=cus_1");
    expect((init as RequestInit).body).toContain("amount=5000");
    expect((init as RequestInit).body).toContain("currency=usd");
  });

  it("addStripeInvoiceItem throws on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 400 }),
    );
    await expect(
      addStripeInvoiceItem("cus_1", 5000, "usd", "x"),
    ).rejects.toThrow(/Stripe invoice item create failed: 400/);
  });

  it("createAndFinalizeStripeInvoice creates draft then finalizes", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "in_1",
            status: "draft",
            hosted_invoice_url: null,
            invoice_pdf: null,
            amount_due: 5000,
            currency: "usd",
            customer: "cus_1",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "in_1",
            status: "open",
            hosted_invoice_url: "https://stripe.example/inv/in_1",
            invoice_pdf: null,
            amount_due: 5000,
            currency: "usd",
            customer: "cus_1",
          }),
          { status: 200 },
        ),
      );
    const finalized = await createAndFinalizeStripeInvoice("cus_1");
    expect(finalized.status).toBe("open");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.stripe.com/v1/invoices",
    );
    expect(String(fetchMock.mock.calls[1]![0])).toBe(
      "https://api.stripe.com/v1/invoices/in_1/finalize",
    );
  });

  it("createAndFinalizeStripeInvoice throws when finalize fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "in_x",
            status: "draft",
            hosted_invoice_url: null,
            invoice_pdf: null,
            amount_due: 0,
            currency: "usd",
            customer: "cus_1",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("oops", { status: 500 }));
    await expect(createAndFinalizeStripeInvoice("cus_1")).rejects.toThrow(
      /Stripe invoice finalize failed: 500/,
    );
  });

  it("getOrCreateStripeCustomer throws when STRIPE_SECRET_KEY is unset", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(getOrCreateStripeCustomer("buyer@x.com")).rejects.toThrow(
      /STRIPE_SECRET_KEY/,
    );
  });

  it("verifyStripeWebhook accepts a correct signature within tolerance", async () => {
    const body = `{"id":"evt_x","type":"invoice.paid"}`;
    const ts = String(Math.floor(Date.now() / 1000));
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode("whsec_test"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      enc.encode(`${ts}.${body}`),
    );
    const hex = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const header = `t=${ts},v1=${hex}`;
    const result = await verifyStripeWebhook(body, header);
    expect(result.ok).toBe(true);
  });

  it("verifyStripeWebhook rejects timestamp outside tolerance", async () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 10_000);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode("whsec_test"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${oldTs}.{}`));
    const hex = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const result = await verifyStripeWebhook("{}", `t=${oldTs},v1=${hex}`);
    expect(result.ok).toBe(false);
  });

  it("verifyStripeWebhook rejects malformed header", async () => {
    const result = await verifyStripeWebhook("{}", "garbage");
    expect(result.ok).toBe(false);
  });

  it("verifyStripeWebhook rejects bad signature", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const result = await verifyStripeWebhook(
      "{}",
      `t=${ts},v1=${"00".repeat(32)}`,
    );
    expect(result.ok).toBe(false);
  });

  it("verifyStripeWebhook throws when STRIPE_WEBHOOK_SIGNING_SECRET is unset", async () => {
    delete process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
    await expect(verifyStripeWebhook("x", "t=0,v1=00")).rejects.toThrow(
      /STRIPE_WEBHOOK_SIGNING_SECRET/,
    );
  });
});
