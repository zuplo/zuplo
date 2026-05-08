import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import stripeWebhook from "../modules/webhooks/stripe.ts";
import {
  invoiceRepository,
  paymentRepository,
} from "../modules/repositories/invoices.ts";

const SECRET = "whsec_invoicing_test";

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

describe("webhooks/stripe", () => {
  beforeEach(async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    for (const t of ["tenant-a"]) {
      const invs = await invoiceRepository.list(t, { limit: 200 });
      for (const i of invs.items) await invoiceRepository.delete(t, i.id);
      const pays = await paymentRepository.list(t, { limit: 200 });
      for (const p of pays.items) await paymentRepository.delete(t, p.id);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_WEBHOOK_SECRET");
  });

  it("accepts a valid invoice.payment_succeeded and marks invoice paid", async () => {
    const inv = await invoiceRepository.create("tenant-a", {
      customerId: "cust_1",
      number: "INV-OK",
      status: "sent",
      subtotalCents: 9000,
      taxCents: 1000,
      totalCents: 10000,
      currency: "usd",
      dueDate: "2024-01-01",
      sentAt: "2024-01-01T00:00:00Z",
      paidAt: null,
      createdAt: "2024-01-01T00:00:00Z",
    });

    const event = {
      id: "evt_1",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_test",
          amount_paid: 10000,
          customer: "cus_1",
          payment_intent: "pi_1",
          metadata: { tenant_id: "tenant-a", tenant_invoice_id: inv.id },
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
      headers: { "stripe-signature": sig, "content-type": "application/json" },
      anonymous: true,
    });

    const res = await stripeWebhook(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean };
    expect(json.received).toBe(true);

    const updated = await invoiceRepository.get("tenant-a", inv.id);
    expect(updated?.status).toBe("paid");
    expect(updated?.paidAt).toBeTruthy();
    const payments = await paymentRepository.list("tenant-a", { limit: 10 });
    expect(payments.items.length).toBe(1);
    expect(payments.items[0].invoiceId).toBe(inv.id);
    expect(payments.items[0].amountCents).toBe(10000);
    expect(payments.items[0].method).toBe("stripe");
    expect(payments.items[0].reference).toBe("pi_1");
  });

  it("flips invoice to overdue on payment_failed", async () => {
    const inv = await invoiceRepository.create("tenant-a", {
      customerId: "cust_1",
      number: "INV-FAIL",
      status: "sent",
      subtotalCents: 100,
      taxCents: 0,
      totalCents: 100,
      currency: "usd",
      dueDate: "2024-01-01",
      sentAt: "2024-01-01T00:00:00Z",
      paidAt: null,
      createdAt: "2024-01-01T00:00:00Z",
    });
    const event = {
      id: "evt_2",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_test_2",
          metadata: { tenant_id: "tenant-a", tenant_invoice_id: inv.id },
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
    const updated = await invoiceRepository.get("tenant-a", inv.id);
    expect(updated?.status).toBe("overdue");
  });

  it("rejects an invalid signature", async () => {
    const event = {
      id: "evt_x",
      type: "invoice.payment_succeeded",
      data: { object: { id: "in_x", metadata: { tenant_id: "tenant-a", tenant_invoice_id: "i_x" } } },
    };
    const raw = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000).toString();
    const fakeSig = `t=${ts},v1=` + "0".repeat(64);
    const inv = await invoiceRepository.create("tenant-a", {
      customerId: "cust_1",
      number: "INV-NOPE",
      status: "sent",
      subtotalCents: 100,
      taxCents: 0,
      totalCents: 100,
      currency: "usd",
      dueDate: "2024-01-01",
      sentAt: null,
      paidAt: null,
      createdAt: "2024-01-01T00:00:00Z",
    });
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
    const after = await invoiceRepository.get("tenant-a", inv.id);
    expect(after?.status).toBe("sent");
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
      type: "customer.updated",
      data: { object: { id: "cus_1", metadata: { tenant_id: "tenant-a", tenant_invoice_id: "i_1" } } },
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
    const ignoredLog = logs.find((l) => String(l.messages[0] ?? "").includes("ignoring"));
    expect(ignoredLog).toBeTruthy();
  });

  it("ignores events without tenant metadata (returns 2xx with ignored=true)", async () => {
    const event = {
      id: "evt_external",
      type: "invoice.payment_succeeded",
      data: {
        object: { id: "in_external", amount_paid: 100, customer: "cus_1", metadata: {} },
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
    const json = (await res.json()) as { received: boolean; ignored: boolean };
    expect(json.received).toBe(true);
    expect(json.ignored).toBe(true);
  });
});
