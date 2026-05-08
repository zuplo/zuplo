import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import stripeWebhook from "../modules/webhooks/stripe.ts";
import {
  subscriptionRepository,
  billingInvoiceRepository,
} from "../modules/repositories/subscriptions.ts";

const SECRET = "whsec_subbilling_test";

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
    const subs = await subscriptionRepository.list(t, { limit: 200 });
    for (const s of subs.items) await subscriptionRepository.delete(t, s.id);
    const invs = await billingInvoiceRepository.list(t, { limit: 200 });
    for (const i of invs.items) await billingInvoiceRepository.delete(t, i.id);
  }
}

describe("webhooks/stripe (subscription-billing)", () => {
  beforeEach(async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    await clearAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_WEBHOOK_SECRET");
  });

  it("customer.subscription.updated reconciles local subscription", async () => {
    const sub = await subscriptionRepository.create("tenant-a", {
      customerId: "c1", planId: "p1", status: "active",
      startDate: "2024-01-01", currentPeriodStart: "2024-04-01",
      currentPeriodEnd: "2024-05-01",
      trialEnd: null, canceledAt: null, createdAt: "2024-01-01T00:00:00Z",
      stripeSubscriptionId: "sub_stripe", stripeCustomerId: "cus_1",
    });
    const event = {
      id: "evt_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_stripe",
          customer: "cus_1",
          status: "past_due",
          current_period_start: 1714521600,
          current_period_end: 1717113600,
          trial_end: null,
          canceled_at: null,
          cancel_at_period_end: false,
          pause_collection: null,
          items: { data: [{ id: "si_1", price: { id: "price_1", product: "prod_1" } }] },
          metadata: { tenant_id: "tenant-a" },
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
    const updated = await subscriptionRepository.get("tenant-a", sub.id);
    expect(updated?.status).toBe("past_due");
    expect(updated?.currentPeriodStart).toBe("2024-05-01T00:00:00.000Z");
  });

  it("invoice.payment_succeeded creates a paid billing invoice row", async () => {
    const sub = await subscriptionRepository.create("tenant-a", {
      customerId: "c1", planId: "p1", status: "active",
      startDate: "2024-01-01", currentPeriodStart: "2024-04-01",
      currentPeriodEnd: "2024-05-01",
      trialEnd: null, canceledAt: null, createdAt: "2024-01-01T00:00:00Z",
      stripeSubscriptionId: "sub_stripe_2", stripeCustomerId: "cus_2",
    });
    const event = {
      id: "evt_2",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test",
          subscription: "sub_stripe_2",
          total: 5000,
          status: "paid",
          period_start: 1714521600,
          period_end: 1717113600,
          metadata: { tenant_id: "tenant-a" },
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
    const invs = await billingInvoiceRepository.list("tenant-a", { limit: 10 });
    expect(invs.items.length).toBe(1);
    expect(invs.items[0].subscriptionId).toBe(sub.id);
    expect(invs.items[0].status).toBe("paid");
    expect(invs.items[0].totalCents).toBe(5000);
  });

  it("rejects invalid signature without writing", async () => {
    await subscriptionRepository.create("tenant-a", {
      customerId: "c1", planId: "p1", status: "active",
      startDate: "x", currentPeriodStart: "x", currentPeriodEnd: "x",
      trialEnd: null, canceledAt: null, createdAt: "x",
      stripeSubscriptionId: "sub_x", stripeCustomerId: "cus_x",
    });
    const event = { id: "e", type: "invoice.payment_succeeded", data: { object: {} } };
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
    const invs = await billingInvoiceRepository.list("tenant-a", { limit: 10 });
    expect(invs.items.length).toBe(0);
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

  it("acks unknown event types with 2xx", async () => {
    const event = {
      id: "evt_x",
      type: "customer.created",
      data: { object: { id: "cus_1" } },
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
