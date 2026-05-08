import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import startDonationCheckout from "../modules/mcp-tools/start-donation-checkout.ts";
import generateYearEndReceipts from "../modules/mcp-tools/generate-year-end-receipts.ts";
import identifyLapsedDonors from "../modules/mcp-tools/identify-lapsed-donors.ts";
import segmentForCampaign from "../modules/mcp-tools/segment-for-campaign.ts";
import listDonors from "../modules/handlers/list-donors.ts";
import listDonations from "../modules/handlers/list-donations.ts";
import { donorRepository } from "../modules/repositories/donors.ts";
import { donationRepository } from "../modules/repositories/donations.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

const routes = {
  "GET /donors": listDonors,
  "GET /donations": listDonations,
};

async function clearAll() {
  for (const t of ["tenant-a", "tenant-b"]) {
    for (const repo of [donorRepository, donationRepository]) {
      const items = await repo.list(t, { limit: 200 });
      for (const i of items.items) await repo.delete(t, i.id);
    }
  }
}

describe("orchestrators/start_donation_checkout", () => {
  beforeEach(clearAll);
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_SECRET_KEY");
  });

  async function seedDonor(tenantId: string) {
    return donorRepository.create(tenantId, {
      firstName: "Jane", lastName: "Doe", email: "jane@a.com",
      mailingAddress: "123 St", donorType: "individual",
      lifetimeGivingCents: 0, lastGiftDate: null, giftCount: 0,
      status: "active", createdAt: "2024-01-01T00:00:00Z",
    });
  }

  it("happy path (one-off): creates Stripe Checkout Session", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const tenantId = "tenant-a";
    const donor = await seedDonor(tenantId);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "cs_1", url: "https://stripe.test/cs_1",
          payment_intent: null, customer: null, amount_total: 5000, currency: "usd",
          metadata: {},
        }),
        { status: 200 },
      ),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/start-donation-checkout",
      method: "POST",
      body: { donorId: donor.id, amountCents: 5000 },
      tenantId,
    });
    const res = await startDonationCheckout(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { sessionId: string; url: string; recurring: boolean };
    expect(json.sessionId).toBe("cs_1");
    expect(json.recurring).toBe(false);
    const body = String((fetchMock.mock.calls[0]![1] as RequestInit).body);
    expect(body).toContain("mode=payment");
  });

  it("recurring=true uses subscription mode", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    const tenantId = "tenant-a";
    const donor = await seedDonor(tenantId);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "cs_2", url: "https://stripe.test/cs_2",
          customer: null, subscription: "sub_1", metadata: {},
        }),
        { status: 200 },
      ),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/start-donation-checkout",
      method: "POST",
      body: { donorId: donor.id, amountCents: 2500, recurring: true },
      tenantId,
    });
    const res = await startDonationCheckout(request, context);
    const json = (await res.json()) as { recurring: boolean };
    expect(json.recurring).toBe(true);
    const body = String((fetchMock.mock.calls[0]![1] as RequestInit).body);
    expect(body).toContain("mode=subscription");
  });
});

describe("orchestrators/generate_year_end_receipts", () => {
  beforeEach(clearAll);
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RESEND_API_KEY");
    clearEnv("RESEND_FROM_EMAIL");
  });

  async function seed(tenantId: string) {
    const donor = await donorRepository.create(tenantId, {
      firstName: "Jane", lastName: "Doe", email: "jane@a.com",
      mailingAddress: "123 St", donorType: "individual",
      lifetimeGivingCents: 10000, lastGiftDate: "2024-06-01T00:00:00Z",
      giftCount: 1, status: "active", createdAt: "2024-01-01T00:00:00Z",
    });
    await donationRepository.create(tenantId, {
      donorId: donor.id, campaignId: null, amountCents: 10000, currency: "usd",
      receivedAt: "2024-06-01T00:00:00.000Z", paymentMethod: "stripe",
      taxDeductibleAmountCents: 10000, anonymous: false, restrictedFund: null,
      stripeChargeId: "ch_1", acknowledgementEmailId: null,
    } as any);
    return { donor };
  }

  it("happy path with email=true: aggregates and dispatches via batch", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "donations@a.com");
    const tenantId = "tenant-a";
    await seed(tenantId);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ id: "e1" }] }),
        { status: 200 },
      ),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/generate-year-end-receipts",
      method: "POST",
      body: { year: 2024, email: true },
      tenantId,
    });
    const res = await generateYearEndReceipts(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { count: number; emailed: number };
    expect(json.count).toBe(1);
    expect(json.emailed).toBe(1);
    const batchCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/emails/batch"),
    );
    expect(batchCall).toBeTruthy();
  });

  it("email=false: aggregates but does not dispatch", async () => {
    const tenantId = "tenant-a";
    await seed(tenantId);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/generate-year-end-receipts",
      method: "POST",
      body: { year: 2024, email: false },
      tenantId,
    });
    const res = await generateYearEndReceipts(request, context);
    const json = (await res.json()) as { count: number; emailed: number };
    expect(json.count).toBe(1);
    expect(json.emailed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no-op for years with no donations", async () => {
    const tenantId = "tenant-a";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/generate-year-end-receipts",
      method: "POST",
      body: { year: 2099 },
      tenantId,
    });
    const res = await generateYearEndReceipts(request, context);
    const json = (await res.json()) as { count: number };
    expect(json.count).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("isolates tenants: only tenant-a receipts", async () => {
    await seed("tenant-a");
    await seed("tenant-b");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/generate-year-end-receipts",
      method: "POST",
      body: { year: 2024, email: false },
      tenantId: "tenant-a",
    });
    const res = await generateYearEndReceipts(request, context);
    const json = (await res.json()) as {
      count: number;
      receipts: { donorId: string }[];
    };
    expect(json.count).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("orchestrators/identify_lapsed_donors", () => {
  beforeEach(clearAll);
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RESEND_API_KEY");
    clearEnv("RESEND_FROM_EMAIL");
  });

  async function seed(tenantId: string) {
    const old = new Date(Date.now() - 18 * 30 * 86400000).toISOString();
    const lapsed = await donorRepository.create(tenantId, {
      firstName: "Old", lastName: "Donor", email: "o@d.com",
      mailingAddress: null, donorType: "individual",
      lifetimeGivingCents: 100000, lastGiftDate: old, giftCount: 5,
      status: "lapsed", createdAt: "2020-01-01T00:00:00Z",
    });
    await donorRepository.create(tenantId, {
      firstName: "Active", lastName: "Donor", email: "a@d.com",
      mailingAddress: null, donorType: "individual",
      lifetimeGivingCents: 100000,
      lastGiftDate: new Date().toISOString(),
      giftCount: 3, status: "active", createdAt: "2024-01-01T00:00:00Z",
    });
    await donorRepository.create(tenantId, {
      firstName: "DNC", lastName: "Donor", email: "dnc@d.com",
      mailingAddress: null, donorType: "individual",
      lifetimeGivingCents: 100000, lastGiftDate: old, giftCount: 5,
      status: "do_not_contact", createdAt: "2020-01-01T00:00:00Z",
    });
    return { lapsed };
  }

  it("happy path with sendReengagement=true sends batch email", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    const tenantId = "tenant-a";
    await seed(tenantId);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "e1" }] }), { status: 200 }),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/identify-lapsed-donors",
      method: "POST",
      body: { monthsLapsed: 12, sendReengagement: true },
      tenantId,
    });
    const res = await identifyLapsedDonors(request, context);
    const json = (await res.json()) as { count: number; emailed?: number };
    expect(json.count).toBe(1);
    expect(json.emailed).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sendReengagement=false: identifies but does not send", async () => {
    const tenantId = "tenant-a";
    await seed(tenantId);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/identify-lapsed-donors",
      method: "POST",
      body: { sendReengagement: false },
      tenantId,
    });
    const res = await identifyLapsedDonors(request, context);
    const json = (await res.json()) as { count: number; emailed?: number };
    expect(json.count).toBe(1);
    expect(json.emailed).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no-op when no lapsed donors", async () => {
    const tenantId = "tenant-a";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/identify-lapsed-donors",
      method: "POST",
      body: {},
      tenantId,
    });
    const res = await identifyLapsedDonors(request, context);
    const json = (await res.json()) as { count: number };
    expect(json.count).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("orchestrators/segment_for_campaign", () => {
  beforeEach(clearAll);

  it("happy path: filters donors by criteria", async () => {
    const tenantId = "tenant-a";
    await donorRepository.create(tenantId, {
      firstName: "Big", lastName: "Donor", email: "b@d.com",
      mailingAddress: null, donorType: "individual",
      lifetimeGivingCents: 200000, lastGiftDate: "2024-06-01T00:00:00Z",
      giftCount: 5, status: "active", createdAt: "x",
    });
    await donorRepository.create(tenantId, {
      firstName: "Small", lastName: "Donor", email: "s@d.com",
      mailingAddress: null, donorType: "individual",
      lifetimeGivingCents: 1000, lastGiftDate: "2024-06-01T00:00:00Z",
      giftCount: 1, status: "active", createdAt: "x",
    });
    await donorRepository.create(tenantId, {
      firstName: "Inactive", lastName: "Donor", email: "i@d.com",
      mailingAddress: null, donorType: "individual",
      lifetimeGivingCents: 100000, lastGiftDate: "2020-01-01T00:00:00Z",
      giftCount: 5, status: "lapsed", createdAt: "x",
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/segment-for-campaign",
      method: "POST",
      body: {
        campaignId: "spring-2024",
        criteria: { minLifetimeCents: 100000, onlyActive: true },
      },
      tenantId,
    });
    const res = await segmentForCampaign(request, context);
    const json = (await res.json()) as { count: number; donors: { firstName: string }[] };
    expect(json.count).toBe(1);
    expect(json.donors[0].firstName).toBe("Big");
  });

  it("no-op when criteria filter to empty segment", async () => {
    const tenantId = "tenant-a";
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/segment-for-campaign",
      method: "POST",
      body: { campaignId: "x" },
      tenantId,
    });
    const res = await segmentForCampaign(request, context);
    const json = (await res.json()) as { count: number };
    expect(json.count).toBe(0);
  });
});
