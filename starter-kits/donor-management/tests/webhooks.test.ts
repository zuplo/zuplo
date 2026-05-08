import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import stripeWebhook from "../modules/webhooks/stripe.ts";
import { donorRepository } from "../modules/repositories/donors.ts";
import { donationRepository } from "../modules/repositories/donations.ts";
import { recurringGiftRepository } from "../modules/repositories/recurring-gifts.ts";

const SECRET = "whsec_donor_test";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

async function signStripe(secret: string, raw: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${raw}`));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${ts},v1=${hex}`;
}

async function clearAll() {
  for (const t of ["tenant-a"]) {
    for (const repo of [donorRepository, donationRepository, recurringGiftRepository]) {
      const items = await repo.list(t, { limit: 200 });
      for (const i of items.items) await repo.delete(t, i.id);
    }
  }
}

describe("webhooks/stripe (donor-management)", () => {
  beforeEach(async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    await clearAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_WEBHOOK_SECRET");
    clearEnv("RESEND_API_KEY");
    clearEnv("RESEND_FROM_EMAIL");
  });

  it("checkout.session.completed (mode=payment) records a donation", async () => {
    const donor = await donorRepository.create("tenant-a", {
      firstName: "Jane", lastName: "Doe", email: "jane@a.com",
      mailingAddress: null, donorType: "individual",
      lifetimeGivingCents: 0, lastGiftDate: null, giftCount: 0,
      status: "active", createdAt: "2024-01-01T00:00:00Z",
    });
    const event = {
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          mode: "payment",
          payment_intent: "pi_1",
          subscription: null,
          customer: "cus_1",
          customer_email: donor.email,
          amount_total: 5000,
          currency: "usd",
          metadata: { tenant_id: "tenant-a", donor_id: donor.id, campaign_id: "" },
        },
      },
    };
    const raw = JSON.stringify(event);
    const sig = await signStripe(SECRET, raw);
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/stripe",
      method: "POST",
      rawBody: raw,
      headers: { "stripe-signature": sig },
      anonymous: true,
    });
    const res = await stripeWebhook(request, context);
    expect(res.status).toBe(200);
    const donations = await donationRepository.list("tenant-a", { limit: 10 });
    expect(donations.items.length).toBe(1);
    expect(donations.items[0].donorId).toBe(donor.id);
    expect(donations.items[0].amountCents).toBe(5000);
    expect(donations.items[0].stripeChargeId).toBe("pi_1");
    const updatedDonor = await donorRepository.get("tenant-a", donor.id);
    expect(updatedDonor?.lifetimeGivingCents).toBe(5000);
    expect(updatedDonor?.giftCount).toBe(1);
  });

  it("checkout.session.completed (mode=subscription) creates a RecurringGift", async () => {
    const donor = await donorRepository.create("tenant-a", {
      firstName: "Sub", lastName: "Donor", email: "sub@a.com",
      mailingAddress: null, donorType: "individual",
      lifetimeGivingCents: 0, lastGiftDate: null, giftCount: 0,
      status: "active", createdAt: "2024-01-01T00:00:00Z",
    });
    const event = {
      id: "evt_2",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_sub",
          mode: "subscription",
          payment_intent: null,
          subscription: "sub_1",
          customer: "cus_1",
          customer_email: donor.email,
          amount_total: null,
          currency: null,
          metadata: { tenant_id: "tenant-a", donor_id: donor.id },
        },
      },
    };
    const raw = JSON.stringify(event);
    const sig = await signStripe(SECRET, raw);
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/stripe",
      method: "POST",
      rawBody: raw,
      headers: { "stripe-signature": sig },
      anonymous: true,
    });
    const res = await stripeWebhook(request, context);
    expect(res.status).toBe(200);
    const gifts = await recurringGiftRepository.list("tenant-a", { limit: 10 });
    expect(gifts.items.length).toBe(1);
    expect(gifts.items[0].stripeSubscriptionId).toBe("sub_1");
    expect(gifts.items[0].status).toBe("active");
  });

  it("customer.subscription.deleted marks RecurringGift canceled", async () => {
    await recurringGiftRepository.create("tenant-a", {
      donorId: "d1", amountCents: 2500, currency: "usd",
      intervalUnit: "monthly",
      nextChargeDate: "2024-06-01T00:00:00Z",
      status: "active", createdAt: "2024-01-01T00:00:00Z",
      stripeSubscriptionId: "sub_kill", stripeCustomerId: "cus_1",
    });
    const event = {
      id: "evt_3",
      type: "customer.subscription.deleted",
      data: {
        object: { id: "sub_kill", metadata: { tenant_id: "tenant-a" } },
      },
    };
    const raw = JSON.stringify(event);
    const sig = await signStripe(SECRET, raw);
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/stripe",
      method: "POST",
      rawBody: raw,
      headers: { "stripe-signature": sig },
      anonymous: true,
    });
    const res = await stripeWebhook(request, context);
    expect(res.status).toBe(200);
    const gifts = await recurringGiftRepository.list("tenant-a", { limit: 10 });
    expect(gifts.items[0].status).toBe("canceled");
  });

  it("rejects an invalid signature without writing", async () => {
    const event = {
      id: "evt_x",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_x", mode: "payment", payment_intent: "pi", subscription: null,
          customer: null, customer_email: null, amount_total: 1, currency: "usd",
          metadata: { tenant_id: "tenant-a", donor_id: "d1" },
        },
      },
    };
    const raw = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000).toString();
    const fakeSig = `t=${ts},v1=` + "0".repeat(64);
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/stripe",
      method: "POST",
      rawBody: raw,
      headers: { "stripe-signature": fakeSig },
      anonymous: true,
    });
    const res = await stripeWebhook(request, context);
    expect(res.status).toBe(400);
    const donations = await donationRepository.list("tenant-a", { limit: 10 });
    expect(donations.items.length).toBe(0);
  });

  it("rejects when signature header is missing", async () => {
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/stripe",
      method: "POST",
      rawBody: "{}",
      anonymous: true,
    });
    const res = await stripeWebhook(request, context);
    expect(res.status).toBe(400);
  });

  it("acks unknown event types without crashing", async () => {
    const event = {
      id: "evt_unknown",
      type: "customer.created",
      data: { object: { id: "x", metadata: { tenant_id: "tenant-a" } } },
    };
    const raw = JSON.stringify(event);
    const sig = await signStripe(SECRET, raw);
    const { context, logs } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/stripe",
      method: "POST",
      rawBody: raw,
      headers: { "stripe-signature": sig },
      anonymous: true,
    });
    const res = await stripeWebhook(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean };
    expect(json.received).toBe(true);
    expect(logs.find((l) => String(l.messages[0] ?? "").includes("ignoring"))).toBeTruthy();
  });
});
