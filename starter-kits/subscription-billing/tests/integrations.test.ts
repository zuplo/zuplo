import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  upsertStripeCustomer,
  createStripePlan,
  createStripeSubscription,
  getStripeSubscription,
  cancelStripeSubscription,
  pauseStripeSubscription,
  resumeStripeSubscription,
  recordStripeUsage,
  listStripeInvoicesForCustomer,
  verifyStripeSignature,
  mapStripeStatus,
} from "../modules/integrations/stripe.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

describe("integrations/stripe — upsertStripeCustomer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_SECRET_KEY");
  });

  it("returns existing customer from search", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const existing = { id: "cus_a", email: "x@y.com" };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ data: [existing] }), { status: 200 }));
    const result = await upsertStripeCustomer({
      email: "x@y.com",
      name: "X",
      tenantCustomerId: "tcust_1",
    });
    expect(result).toEqual(existing);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/customers/search");
    const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer sk_test");
  });

  it("creates a new customer when search is empty", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "cus_new", email: "z@y.com" }), { status: 200 }));
    const result = await upsertStripeCustomer({
      email: "z@y.com",
      name: "Z",
      tenantCustomerId: "tcust_2",
    });
    expect(result.id).toBe("cus_new");
    const createBody = String((fetchMock.mock.calls[1]![1] as RequestInit).body);
    expect(createBody).toContain("metadata%5Btenant_customer_id%5D=tcust_2");
  });

  it("throws on non-2xx", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    await expect(
      upsertStripeCustomer({ email: "a@b", name: "A", tenantCustomerId: "x" }),
    ).rejects.toThrow(/Stripe GET/);
  });

  it("throws when STRIPE_SECRET_KEY is unset", async () => {
    clearEnv("STRIPE_SECRET_KEY");
    await expect(
      upsertStripeCustomer({ email: "a@b", name: "A", tenantCustomerId: "x" }),
    ).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });
});

describe("integrations/stripe — createStripePlan", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_SECRET_KEY");
  });

  it("creates a product then a price", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "prod_1", name: "Pro", metadata: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "price_1", product: "prod_1", unit_amount: 5000, currency: "usd", recurring: { interval: "month", interval_count: 1 }, metadata: {} }), { status: 200 }));

    const result = await createStripePlan({
      name: "Pro",
      intervalUnit: "month",
      priceCents: 5000,
      currency: "usd",
      tenantPlanId: "plan_a",
    });
    expect(result).toEqual({ productId: "prod_1", priceId: "price_1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/products");
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/prices");
  });

  it("throws on non-2xx for product", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(
      createStripePlan({ name: "x", intervalUnit: "month", priceCents: 1, currency: "usd", tenantPlanId: "x" }),
    ).rejects.toThrow(/Stripe POST/);
  });

  it("throws when STRIPE_SECRET_KEY is unset", async () => {
    clearEnv("STRIPE_SECRET_KEY");
    await expect(
      createStripePlan({ name: "x", intervalUnit: "month", priceCents: 1, currency: "usd", tenantPlanId: "x" }),
    ).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });
});

describe("integrations/stripe — subscription lifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_SECRET_KEY");
  });

  const stubSub = {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    current_period_start: 0,
    current_period_end: 0,
    trial_end: null,
    canceled_at: null,
    cancel_at_period_end: false,
    pause_collection: null,
    items: { data: [{ id: "si_1", price: { id: "price_1", product: "prod_1" } }] },
    metadata: {},
  };

  it("createStripeSubscription POSTs to /subscriptions with customer + items", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(stubSub), { status: 200 }));
    const result = await createStripeSubscription({
      stripeCustomerId: "cus_1",
      stripePriceId: "price_1",
      metadata: { tenant_id: "t1" },
    });
    expect(result).toEqual(stubSub);
    const body = String((fetchMock.mock.calls[0]![1] as RequestInit).body);
    expect(body).toContain("customer=cus_1");
    expect(body).toContain("items%5B0%5D%5Bprice%5D=price_1");
    expect(body).toContain("metadata%5Btenant_id%5D=t1");
  });

  it("getStripeSubscription GETs /subscriptions/:id", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(stubSub), { status: 200 }));
    const result = await getStripeSubscription("sub_1");
    expect(result).toEqual(stubSub);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.stripe.com/v1/subscriptions/sub_1");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("GET");
  });

  it("cancelStripeSubscription DELETEs when immediate=true", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(stubSub), { status: 200 }));
    await cancelStripeSubscription({ stripeSubscriptionId: "sub_1", immediate: true });
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
  });

  it("cancelStripeSubscription POSTs cancel_at_period_end when immediate is false/missing", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(stubSub), { status: 200 }));
    await cancelStripeSubscription({ stripeSubscriptionId: "sub_1" });
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    expect(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).toContain(
      "cancel_at_period_end=true",
    );
  });

  it("pauseStripeSubscription posts pause_collection.behavior=void", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(stubSub), { status: 200 }));
    await pauseStripeSubscription("sub_1");
    expect(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).toContain(
      "pause_collection%5Bbehavior%5D=void",
    );
  });

  it("resumeStripeSubscription posts pause_collection=''", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(stubSub), { status: 200 }));
    await resumeStripeSubscription("sub_1");
    expect(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).toContain(
      "pause_collection=",
    );
  });

  it("createStripeSubscription throws on non-2xx", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    await expect(
      createStripeSubscription({ stripeCustomerId: "c", stripePriceId: "p" }),
    ).rejects.toThrow(/Stripe POST/);
  });

  it("createStripeSubscription throws when STRIPE_SECRET_KEY is unset", async () => {
    clearEnv("STRIPE_SECRET_KEY");
    await expect(
      createStripeSubscription({ stripeCustomerId: "c", stripePriceId: "p" }),
    ).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });
});

describe("integrations/stripe — recordStripeUsage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_SECRET_KEY");
  });

  it("POSTs a usage record", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: "ur_1", quantity: 5, timestamp: 12345 }),
          { status: 200 },
        ),
      );
    const result = await recordStripeUsage({ subscriptionItemId: "si_1", quantity: 5 });
    expect(result.quantity).toBe(5);
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "/subscription_items/si_1/usage_records",
    );
  });

  it("throws on non-2xx", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(
      recordStripeUsage({ subscriptionItemId: "si_1", quantity: 1 }),
    ).rejects.toThrow(/Stripe POST/);
  });

  it("throws when STRIPE_SECRET_KEY is unset", async () => {
    clearEnv("STRIPE_SECRET_KEY");
    await expect(
      recordStripeUsage({ subscriptionItemId: "si_1", quantity: 1 }),
    ).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });
});

describe("integrations/stripe — listStripeInvoicesForCustomer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_SECRET_KEY");
  });

  it("GETs /invoices?customer=:id&limit=:n", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await listStripeInvoicesForCustomer("cus_1", 25);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/invoices?customer=cus_1&limit=25");
  });

  it("throws on non-2xx", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(listStripeInvoicesForCustomer("cus_1")).rejects.toThrow(/Stripe GET/);
  });

  it("throws when STRIPE_SECRET_KEY is unset", async () => {
    clearEnv("STRIPE_SECRET_KEY");
    await expect(listStripeInvoicesForCustomer("cus_1")).rejects.toThrow(/STRIPE_SECRET_KEY/);
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
    const raw = '{"id":"evt"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = await computeV1("whsec_test", ts, raw);
    expect(
      await verifyStripeSignature({ rawBody: raw, signatureHeader: `t=${ts},v1=${v1}` }),
    ).toBe(true);
  });

  it("returns false when timestamp is too old", async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const raw = "{}";
    const oldTs = String(Math.floor(Date.now() / 1000) - 10_000);
    const v1 = await computeV1("whsec_test", oldTs, raw);
    expect(
      await verifyStripeSignature({ rawBody: raw, signatureHeader: `t=${oldTs},v1=${v1}` }),
    ).toBe(false);
  });

  it("throws when STRIPE_WEBHOOK_SECRET is unset", async () => {
    clearEnv("STRIPE_WEBHOOK_SECRET");
    await expect(
      verifyStripeSignature({ rawBody: "{}", signatureHeader: "t=1,v1=abc" }),
    ).rejects.toThrow(/STRIPE_WEBHOOK_SECRET/);
  });
});

describe("integrations/stripe — mapStripeStatus", () => {
  it("maps active to active", () => {
    expect(mapStripeStatus("active", null)).toBe("active");
  });
  it("maps past_due to past_due", () => {
    expect(mapStripeStatus("past_due", null)).toBe("past_due");
  });
  it("maps canceled to canceled", () => {
    expect(mapStripeStatus("canceled", null)).toBe("canceled");
  });
  it("returns paused when pause_collection is set", () => {
    expect(
      mapStripeStatus("active", { behavior: "void", resumes_at: null }),
    ).toBe("paused");
  });
});
