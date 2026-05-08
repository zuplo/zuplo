import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import stripeWebhook from "../modules/webhooks/stripe.ts";
import {
  billRepository,
  billPaymentRepository,
} from "../modules/repositories/bills.ts";

const SECRET = "whsec_ap_test";

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
    const bills = await billRepository.list(t, { limit: 200 });
    for (const b of bills.items) await billRepository.delete(t, b.id);
    const pays = await billPaymentRepository.list(t, { limit: 200 });
    for (const p of pays.items) await billPaymentRepository.delete(t, p.id);
  }
}

describe("webhooks/stripe (accounts-payable)", () => {
  beforeEach(async () => {
    setEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    await clearAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("STRIPE_WEBHOOK_SECRET");
  });

  it("transfer.paid flips bill to paid and sets payment paidAt", async () => {
    const bill = await billRepository.create("tenant-a", {
      vendorId: "v1", billNumber: "B-1", amountCents: 5000, currency: "usd",
      dueDate: "2024-05-01", status: "approved", glCode: "5000",
      poNumber: null, attachmentUrl: null, approverEmail: null,
      approvedAt: "2024-04-30T00:00:00Z", paidAt: null,
      createdAt: "2024-04-01T00:00:00Z",
    } as any);
    const pmt = await billPaymentRepository.create("tenant-a", {
      billId: bill.id, amountCents: 5000, method: "transfer",
      scheduledFor: "2024-05-01", paidAt: null, reference: "REF-1",
      createdAt: "2024-04-30T00:00:00Z",
    });
    const event = {
      id: "evt_1",
      type: "transfer.paid",
      data: {
        object: {
          id: "tr_1",
          amount: 5000,
          metadata: {
            tenant_id: "tenant-a",
            tenant_bill_id: bill.id,
            tenant_payment_id: pmt.id,
          },
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
    const updatedBill = await billRepository.get("tenant-a", bill.id);
    expect(updatedBill?.status).toBe("paid");
    expect(updatedBill?.paidAt).toBeTruthy();
    const updatedPmt = await billPaymentRepository.get("tenant-a", pmt.id);
    expect(updatedPmt?.paidAt).toBeTruthy();
  });

  it("transfer.reversed flips bill back to approved", async () => {
    const bill = await billRepository.create("tenant-a", {
      vendorId: "v1", billNumber: "B-1", amountCents: 5000, currency: "usd",
      dueDate: "2024-05-01", status: "paid", glCode: "5000",
      poNumber: null, attachmentUrl: null, approverEmail: null,
      approvedAt: "2024-04-30T00:00:00Z", paidAt: "2024-05-02T00:00:00Z",
      createdAt: "2024-04-01T00:00:00Z",
    } as any);
    const event = {
      id: "evt_2",
      type: "transfer.reversed",
      data: {
        object: {
          id: "tr_2",
          amount: 5000,
          metadata: { tenant_id: "tenant-a", tenant_bill_id: bill.id },
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
    const updated = await billRepository.get("tenant-a", bill.id);
    expect(updated?.status).toBe("approved");
    expect(updated?.paidAt).toBeNull();
  });

  it("rejects an invalid signature without writing", async () => {
    const bill = await billRepository.create("tenant-a", {
      vendorId: "v1", billNumber: "B-1", amountCents: 5000, currency: "usd",
      dueDate: "2024-05-01", status: "approved", glCode: "5000",
      poNumber: null, attachmentUrl: null, approverEmail: null,
      approvedAt: "x", paidAt: null, createdAt: "x",
    } as any);
    const event = {
      id: "e",
      type: "transfer.paid",
      data: {
        object: { id: "tr", amount: 1, metadata: { tenant_id: "tenant-a", tenant_bill_id: bill.id } },
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
    const after = await billRepository.get("tenant-a", bill.id);
    expect(after?.status).toBe("approved");
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
      id: "evt_x",
      type: "ping",
      data: { object: { id: "x", amount: 0, metadata: { tenant_id: "tenant-a" } } },
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
    expect(logs.find((l) => String(l.messages[0] ?? "").includes("ignoring"))).toBeTruthy();
  });

  it("ignores events without tenant metadata", async () => {
    const event = {
      id: "evt_ext",
      type: "transfer.paid",
      data: { object: { id: "tr_ext", amount: 0, metadata: {} } },
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
    const json = (await res.json()) as { ignored: boolean };
    expect(json.ignored).toBe(true);
  });
});
