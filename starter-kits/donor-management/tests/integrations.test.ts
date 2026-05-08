import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  createDonationCheckoutSession,
  createRecurringGiftCheckoutSession,
  getCharge,
  verifyStripeSignature,
} from "../modules/integrations/stripe.ts";
import { sendPledgeEnvelope } from "../modules/integrations/docusign.ts";
import {
  sendResendEmail,
  sendResendBatch,
  defaultFrom,
} from "../modules/integrations/resend.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

describe("integrations/stripe — createDonationCheckoutSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_SECRET_KEY");
  });

  it("POSTs /checkout/sessions with mode=payment and metadata", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const stub = {
      id: "cs_1", url: "https://stripe.test/cs_1",
      payment_intent: null, customer: null, amount_total: 5000, currency: "usd",
      metadata: { tenant_id: "t1", donor_id: "d1" },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(stub), { status: 200 }),
    );
    const result = await createDonationCheckoutSession({
      amountCents: 5000, currency: "usd", donorEmail: "a@b.com",
      successUrl: "https://x/y", cancelUrl: "https://x/c",
      metadata: { tenant_id: "t1", donor_id: "d1" },
    });
    expect(result.id).toBe("cs_1");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = String(init.body);
    expect(body).toContain("mode=payment");
    expect(body).toContain("submit_type=donate");
    expect(body).toContain("metadata%5Btenant_id%5D=t1");
    expect(body).toContain("metadata%5Bdonor_id%5D=d1");
    expect(body).toContain("customer_email=a%40b.com");
    expect(body).toContain("line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=5000");
  });

  it("throws on non-2xx", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    await expect(
      createDonationCheckoutSession({
        amountCents: 1, currency: "usd", donorEmail: "x", successUrl: "x",
        cancelUrl: "x", metadata: { tenant_id: "x", donor_id: "x" },
      }),
    ).rejects.toThrow(/Stripe POST/);
  });

  it("throws when STRIPE_SECRET_KEY is unset", async () => {
    clearEnv("STRIPE_SECRET_KEY");
    await expect(
      createDonationCheckoutSession({
        amountCents: 1, currency: "usd", donorEmail: "x", successUrl: "x",
        cancelUrl: "x", metadata: { tenant_id: "x", donor_id: "x" },
      }),
    ).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });
});

describe("integrations/stripe — createRecurringGiftCheckoutSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_SECRET_KEY");
  });

  it("POSTs /checkout/sessions with mode=subscription and recurring price", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const stub = {
      id: "cs_2", url: "https://stripe.test/cs_2",
      customer: null, subscription: "sub_1",
      metadata: { tenant_id: "t1", donor_id: "d1" },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(stub), { status: 200 }),
    );
    const result = await createRecurringGiftCheckoutSession({
      amountCents: 2500, currency: "usd", donorEmail: "a@b.com",
      successUrl: "x", cancelUrl: "y",
      metadata: { tenant_id: "t1", donor_id: "d1" },
    });
    expect(result.id).toBe("cs_2");
    const body = String((fetchMock.mock.calls[0]![1] as RequestInit).body);
    expect(body).toContain("mode=subscription");
    expect(body).toContain(
      "line_items%5B0%5D%5Bprice_data%5D%5Brecurring%5D%5Binterval%5D=month",
    );
  });

  it("throws on non-2xx", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    await expect(
      createRecurringGiftCheckoutSession({
        amountCents: 1, currency: "usd", donorEmail: "x", successUrl: "x", cancelUrl: "y",
        metadata: { tenant_id: "x", donor_id: "x" },
      }),
    ).rejects.toThrow(/Stripe POST/);
  });

  it("throws when STRIPE_SECRET_KEY is unset", async () => {
    clearEnv("STRIPE_SECRET_KEY");
    await expect(
      createRecurringGiftCheckoutSession({
        amountCents: 1, currency: "usd", donorEmail: "x", successUrl: "x", cancelUrl: "y",
        metadata: { tenant_id: "x", donor_id: "x" },
      }),
    ).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });
});

describe("integrations/stripe — getCharge / verifyStripeSignature", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_SECRET_KEY");
    clearEnv("STRIPE_WEBHOOK_SECRET");
  });

  it("getCharge GETs /charges/:id", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ id: "ch_1", amount: 100, currency: "usd", payment_intent: null, receipt_url: null }),
        { status: 200 },
      ),
    );
    const result = await getCharge("ch_1");
    expect(result.id).toBe("ch_1");
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.stripe.com/v1/charges/ch_1");
  });

  it("verifyStripeSignature returns true for a valid signature", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const raw = "{}";
    const ts = String(Math.floor(Date.now() / 1000));
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode("whsec_test"),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${raw}`));
    const v1 = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(
      await verifyStripeSignature({ rawBody: raw, signatureHeader: `t=${ts},v1=${v1}` }),
    ).toBe(true);
  });

  it("verifyStripeSignature throws when STRIPE_WEBHOOK_SECRET unset", async () => {
    clearEnv("STRIPE_WEBHOOK_SECRET");
    await expect(
      verifyStripeSignature({ rawBody: "{}", signatureHeader: "t=1,v1=abc" }),
    ).rejects.toThrow(/STRIPE_WEBHOOK_SECRET/);
  });
});

/**
 * NOTE: sendPledgeEnvelope unconditionally builds an inline base64 placeholder
 * via btoa() that contains a non-ASCII em-dash, which throws InvalidCharacterError
 * in Node's strict latin1 btoa. We work around this by spying on btoa for the
 * happy-path test so we can exercise the rest of the body construction.
 */
describe("integrations/docusign — sendPledgeEnvelope", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("DOCUSIGN_ACCESS_TOKEN");
    clearEnv("DOCUSIGN_BASE_URI");
    clearEnv("DOCUSIGN_ACCOUNT_ID");
  });

  it("POSTs envelope with bearer + customFields metadata", async () => {
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_tok");
    setEnv("DOCUSIGN_BASE_URI", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "acct_1");
    // The kit's placeholder path uses btoa() with a non-ASCII em-dash; stub it.
    vi.spyOn(globalThis, "btoa").mockImplementation(() => "QUJD");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ envelopeId: "env_1", status: "sent", uri: "/envelopes/env_1" }),
        { status: 201 },
      ),
    );
    const result = await sendPledgeEnvelope({
      donorEmail: "donor@a.com",
      donorName: "Jane Doe",
      amountCents: 100000,
      currency: "USD",
      termYears: 5,
      metadata: { tenant_id: "t1", pledge_id: "p1" },
      documentBase64: "QUJD",
    });
    expect(result.envelopeId).toBe("env_1");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer ds_tok");
    const body = JSON.parse(init.body as string);
    expect(body.recipients.signers[0].email).toBe("donor@a.com");
    expect(body.documents[0].name).toBe("Pledge-Agreement.pdf");
    expect(body.documents[0].documentBase64).toBe("QUJD");
    expect(body.customFields.textCustomFields).toContainEqual(
      expect.objectContaining({ name: "tenant_id", value: "t1" }),
    );
    expect(body.status).toBe("sent");
  });

  it("throws on non-2xx", async () => {
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_tok");
    setEnv("DOCUSIGN_BASE_URI", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "acct_1");
    vi.spyOn(globalThis, "btoa").mockImplementation(() => "QUJD");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    await expect(
      sendPledgeEnvelope({
        donorEmail: "x", donorName: "x", amountCents: 1, currency: "USD",
        termYears: 1, metadata: {},
        documentBase64: "QUJD",
      }),
    ).rejects.toThrow(/DocuSign envelope create failed/);
  });

  it("throws when DOCUSIGN_ACCESS_TOKEN is unset", async () => {
    clearEnv("DOCUSIGN_ACCESS_TOKEN");
    setEnv("DOCUSIGN_BASE_URI", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "acct_1");
    await expect(
      sendPledgeEnvelope({
        donorEmail: "x", donorName: "x", amountCents: 1, currency: "USD",
        termYears: 1, metadata: {},
        documentBase64: "QUJD",
      }),
    ).rejects.toThrow(/DOCUSIGN_ACCESS_TOKEN/);
  });
});

describe("integrations/resend", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RESEND_API_KEY");
    clearEnv("RESEND_FROM_EMAIL");
  });

  it("sendResendEmail POSTs /emails with bearer", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "e1" }), { status: 200 }),
    );
    const result = await sendResendEmail({
      to: "donor@a.com", from: "from@a.com", subject: "Thanks", text: "thank you",
    });
    expect(result.id).toBe("e1");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer re_test");
  });

  it("sendResendEmail throws on non-2xx", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    await expect(
      sendResendEmail({ to: "x", from: "y", subject: "z" }),
    ).rejects.toThrow(/Resend send failed/);
  });

  it("sendResendEmail throws when RESEND_API_KEY is unset", async () => {
    clearEnv("RESEND_API_KEY");
    await expect(
      sendResendEmail({ to: "x", from: "y", subject: "z" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("sendResendBatch POSTs /emails/batch with array body", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "e1" }, { id: "e2" }] }), { status: 200 }),
    );
    const result = await sendResendBatch([
      { to: "a@a", from: "x", subject: "y" },
      { to: "b@b", from: "x", subject: "y" },
    ]);
    expect(result.data.length).toBe(2);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.resend.com/emails/batch");
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
  });

  it("sendResendBatch returns empty when given empty array", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await sendResendBatch([]);
    expect(result.data).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sendResendBatch throws when more than 100 emails passed", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    const tooMany = Array.from({ length: 101 }, () => ({
      to: "a@a", from: "b", subject: "x",
    }));
    await expect(sendResendBatch(tooMany)).rejects.toThrow(/100 emails/);
  });

  it("sendResendBatch throws when RESEND_API_KEY is unset", async () => {
    clearEnv("RESEND_API_KEY");
    await expect(sendResendBatch([{ to: "x", from: "y", subject: "z" }])).rejects.toThrow(
      /RESEND_API_KEY/,
    );
  });

  it("defaultFrom returns env or fallback", () => {
    setEnv("RESEND_FROM_EMAIL", "donations@acme.org");
    expect(defaultFrom()).toBe("donations@acme.org");
    clearEnv("RESEND_FROM_EMAIL");
    expect(defaultFrom()).toBe("donations@example.org");
  });
});
