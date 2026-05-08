import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  syncTransactions,
  getTransactions,
} from "../modules/integrations/plaid.ts";
import { parseBillFromUrl } from "../modules/integrations/mindee.ts";
import {
  transferToVendor,
  verifyStripeSignature,
} from "../modules/integrations/stripe.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

describe("integrations/plaid — syncTransactions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("PLAID_CLIENT_ID");
    clearEnv("PLAID_SECRET");
  });

  it("POSTs /transactions/sync with creds in body", async () => {
    setEnv("PLAID_CLIENT_ID", "cid_test");
    setEnv("PLAID_SECRET", "sec_test");
    const stub = { added: [], modified: [], removed: [], next_cursor: "c1", has_more: false };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(stub), { status: 200 }));
    const result = await syncTransactions({ accessToken: "access-1" });
    expect(result).toEqual(stub);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/transactions/sync");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.client_id).toBe("cid_test");
    expect(body.secret).toBe("sec_test");
    expect(body.access_token).toBe("access-1");
    expect(body.count).toBe(100);
  });

  it("throws on non-2xx", async () => {
    setEnv("PLAID_CLIENT_ID", "cid_test");
    setEnv("PLAID_SECRET", "sec_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("oops", { status: 400 }));
    await expect(syncTransactions({ accessToken: "x" })).rejects.toThrow(/Plaid/);
  });

  it("throws when PLAID_CLIENT_ID is unset", async () => {
    clearEnv("PLAID_CLIENT_ID");
    setEnv("PLAID_SECRET", "x");
    await expect(syncTransactions({ accessToken: "x" })).rejects.toThrow(
      /PLAID_CLIENT_ID/,
    );
  });

  it("throws when PLAID_SECRET is unset", async () => {
    setEnv("PLAID_CLIENT_ID", "x");
    clearEnv("PLAID_SECRET");
    await expect(syncTransactions({ accessToken: "x" })).rejects.toThrow(/PLAID_SECRET/);
  });
});

describe("integrations/plaid — getTransactions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("PLAID_CLIENT_ID");
    clearEnv("PLAID_SECRET");
  });

  it("POSTs /transactions/get with date range", async () => {
    setEnv("PLAID_CLIENT_ID", "cid_test");
    setEnv("PLAID_SECRET", "sec_test");
    const stub = { transactions: [], total_transactions: 0 };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(stub), { status: 200 }));
    await getTransactions({
      accessToken: "a",
      startDate: "2024-04-01",
      endDate: "2024-05-01",
    });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.start_date).toBe("2024-04-01");
    expect(body.end_date).toBe("2024-05-01");
    expect(body.options.count).toBe(100);
  });

  it("throws on non-2xx", async () => {
    setEnv("PLAID_CLIENT_ID", "cid_test");
    setEnv("PLAID_SECRET", "sec_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    await expect(
      getTransactions({ accessToken: "a", startDate: "2024-04-01", endDate: "2024-05-01" }),
    ).rejects.toThrow(/Plaid/);
  });

  it("throws when creds are unset", async () => {
    clearEnv("PLAID_CLIENT_ID");
    clearEnv("PLAID_SECRET");
    await expect(
      getTransactions({ accessToken: "a", startDate: "2024-04-01", endDate: "2024-05-01" }),
    ).rejects.toThrow(/PLAID_/);
  });
});

const MINDEE_OK = {
  document: {
    inference: {
      prediction: {
        total_amount: { value: 250.0, confidence: 0.9 },
        currency: { value: "USD", confidence: 0.95 },
        date: { value: "2024-05-01", confidence: 0.85 },
        supplier_name: { value: "Acme Vendor", confidence: 0.9 },
        receipt_number: { value: "BILL-1", confidence: 0.7 },
        category: { value: "saas", confidence: 0.5 },
      },
    },
  },
};

describe("integrations/mindee — parseBillFromUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("MINDEE_API_KEY");
  });

  it("POSTs FormData with Token auth and normalizes the response", async () => {
    setEnv("MINDEE_API_KEY", "mindee_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(MINDEE_OK), { status: 200 }));
    const parsed = await parseBillFromUrl("https://x.test/bill.pdf");
    expect(parsed.vendor).toBe("Acme Vendor");
    expect(parsed.amountCents).toBe(25000);
    expect(parsed.currency).toBe("USD");
    expect(parsed.date).toBe("2024-05-01");
    expect(parsed.receiptNumber).toBe("BILL-1");
    expect(parsed.confidence).toBeGreaterThan(0.5);
    const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Token mindee_test");
  });

  it("throws on non-2xx", async () => {
    setEnv("MINDEE_API_KEY", "mindee_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    await expect(parseBillFromUrl("https://x.test/b.pdf")).rejects.toThrow(/Mindee/);
  });

  it("throws when MINDEE_API_KEY is unset", async () => {
    clearEnv("MINDEE_API_KEY");
    await expect(parseBillFromUrl("https://x.test/b.pdf")).rejects.toThrow(/MINDEE_API_KEY/);
  });
});

describe("integrations/stripe — transferToVendor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_SECRET_KEY");
  });

  it("POSTs /transfers with idempotency-key, currency, and metadata", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const stub = {
      id: "tr_1",
      amount: 5000,
      currency: "usd",
      destination: "acct_1",
      metadata: { tenant_id: "t1" },
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(stub), { status: 200 }));
    const result = await transferToVendor({
      amountCents: 5000,
      currency: "USD",
      connectedAccountId: "acct_1",
      idempotencyKey: "key-1",
      metadata: { tenant_id: "t1", tenant_bill_id: "b1" },
    });
    expect(result).toEqual(stub);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/transfers");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer sk_test");
    expect(headers.get("idempotency-key")).toBe("key-1");
    const body = String((init as RequestInit).body);
    expect(body).toContain("amount=5000");
    expect(body).toContain("currency=usd");
    expect(body).toContain("destination=acct_1");
    expect(body).toContain("metadata%5Btenant_id%5D=t1");
  });

  it("throws on non-2xx", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    await expect(
      transferToVendor({
        amountCents: 1,
        currency: "usd",
        connectedAccountId: "acct_1",
        idempotencyKey: "k",
      }),
    ).rejects.toThrow(/Stripe POST/);
  });

  it("throws when STRIPE_SECRET_KEY is unset", async () => {
    clearEnv("STRIPE_SECRET_KEY");
    await expect(
      transferToVendor({
        amountCents: 1,
        currency: "usd",
        connectedAccountId: "acct_1",
        idempotencyKey: "k",
      }),
    ).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });
});

describe("integrations/stripe — verifyStripeSignature", () => {
  afterEach(() => clearEnv("STRIPE_WEBHOOK_SECRET"));

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

  it("returns true for a valid signature", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const raw = "{}";
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = await computeV1("whsec_test", ts, raw);
    expect(
      await verifyStripeSignature({ rawBody: raw, signatureHeader: `t=${ts},v1=${v1}` }),
    ).toBe(true);
  });

  it("returns false for tampered body", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = await computeV1("whsec_test", ts, "{}");
    expect(
      await verifyStripeSignature({
        rawBody: '{"x":1}',
        signatureHeader: `t=${ts},v1=${v1}`,
      }),
    ).toBe(false);
  });

  it("throws when STRIPE_WEBHOOK_SECRET is unset", async () => {
    clearEnv("STRIPE_WEBHOOK_SECRET");
    await expect(
      verifyStripeSignature({ rawBody: "{}", signatureHeader: "t=1,v1=abc" }),
    ).rejects.toThrow(/STRIPE_WEBHOOK_SECRET/);
  });
});
