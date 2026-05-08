import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import docusignWebhook from "../modules/webhooks/docusign.ts";
import stripeWebhook from "../modules/webhooks/stripe.ts";
import { quoteRepository } from "../modules/repositories/quotes.ts";

async function clearAll(tenantId: string) {
  let cursor: string | null | undefined = null;
  do {
    const page = await quoteRepository.list(tenantId, { limit: 200, cursor });
    for (const item of page.items) {
      await quoteRepository.delete(tenantId, item.id);
    }
    cursor = page.nextCursor;
  } while (cursor);
}

async function signDocusign(body: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function signStripe(
  body: string,
  secret: string,
  ts: number,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${ts}.${body}`),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("webhooks/docusign", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    process.env.DOCUSIGN_WEBHOOK_HMAC_KEY = "ds-hmac";
    process.env.DOCUSIGN_TENANT_ID = tenantId;
    await clearAll(tenantId);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.DOCUSIGN_WEBHOOK_HMAC_KEY;
    delete process.env.DOCUSIGN_TENANT_ID;
    await clearAll(tenantId);
  });

  it("with valid signature flips quote to accepted on envelope-completed", async () => {
    const quote = await quoteRepository.create(tenantId, {
      dealId: "d-1",
      customerId: "c-1",
      ownerEmail: "rep@example.com",
      status: "sent",
      subtotalCents: 100_000,
      discountCents: 0,
      totalCents: 100_000,
      currency: "USD",
      validUntil: "2026-09-01",
      sentAt: new Date().toISOString(),
      acceptedAt: null,
      terms: "Net 30",
      createdAt: new Date().toISOString(),
    });
    const body = JSON.stringify({
      event: "envelope-completed",
      data: {
        envelopeId: "env-1",
        envelopeSummary: {
          status: "completed",
          customFields: {
            textCustomFields: [{ name: "quoteId", value: quote.id }],
          },
        },
      },
    });
    const sig = await signDocusign(body, "ds-hmac");
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: "https://kit.test/webhooks/docusign",
      method: "POST",
      rawBody: body,
      headers: { "x-docusign-signature-1": sig },
      tenantId,
      anonymous: true,
    });
    const response = await docusignWebhook(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { received: boolean };
    expect(json.received).toBe(true);
    const updated = await quoteRepository.get(tenantId, quote.id);
    expect(updated?.status).toBe("accepted");
    expect(updated?.acceptedAt).toBeTruthy();
  });

  it("returns 401 on bad signature and does not update quote", async () => {
    const quote = await quoteRepository.create(tenantId, {
      dealId: "d-1",
      customerId: "c-1",
      ownerEmail: "rep@example.com",
      status: "sent",
      subtotalCents: 100_000,
      discountCents: 0,
      totalCents: 100_000,
      currency: "USD",
      validUntil: "2026-09-01",
      sentAt: new Date().toISOString(),
      acceptedAt: null,
      terms: "Net 30",
      createdAt: new Date().toISOString(),
    });
    const body = JSON.stringify({
      event: "envelope-completed",
      data: {
        envelopeId: "env-1",
        envelopeSummary: {
          status: "completed",
          customFields: {
            textCustomFields: [{ name: "quoteId", value: quote.id }],
          },
        },
      },
    });
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: "https://kit.test/webhooks/docusign",
      method: "POST",
      rawBody: body,
      headers: { "x-docusign-signature-1": "AAAAA" },
      tenantId,
      anonymous: true,
    });
    const response = await docusignWebhook(request, context);
    expect(response.status).toBe(401);
    const updated = await quoteRepository.get(tenantId, quote.id);
    expect(updated?.status).toBe("sent");
    expect(updated?.acceptedAt).toBeNull();
  });

  it("returns 400 when signature header is missing", async () => {
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: "https://kit.test/webhooks/docusign",
      method: "POST",
      rawBody: "{}",
      tenantId,
      anonymous: true,
    });
    const response = await docusignWebhook(request, context);
    expect(response.status).toBe(400);
  });

  it("with valid signature but unknown event still returns 200", async () => {
    const body = JSON.stringify({
      event: "envelope-sent",
      data: {
        envelopeId: "env-9",
        envelopeSummary: {
          status: "sent",
          customFields: { textCustomFields: [] },
        },
      },
    });
    const sig = await signDocusign(body, "ds-hmac");
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: "https://kit.test/webhooks/docusign",
      method: "POST",
      rawBody: body,
      headers: { "x-docusign-signature-1": sig },
      tenantId,
      anonymous: true,
    });
    const response = await docusignWebhook(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { received: boolean };
    expect(json.received).toBe(true);
  });
});

describe("webhooks/stripe", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SIGNING_SECRET = "whsec_test";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
  });

  it("with valid signature accepts and logs known events", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      id: "evt_1",
      type: "invoice.paid",
      data: { object: { id: "in_1", customer: "cus_1" } },
    });
    const v1 = await signStripe(body, "whsec_test", ts);
    const { context, logs } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/stripe",
      method: "POST",
      rawBody: body,
      headers: { "stripe-signature": `t=${ts},v1=${v1}` },
      anonymous: true,
    });
    const response = await stripeWebhook(request, context);
    expect(response.status).toBe(200);
    const infoLogs = logs.filter((l) => l.level === "info");
    const hasPaidLog = infoLogs.some((l) =>
      l.messages.some((m) => String(m).includes("invoice paid")),
    );
    expect(hasPaidLog).toBe(true);
  });

  it("returns 401 on bad signature", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      id: "evt_1",
      type: "invoice.paid",
      data: { object: {} },
    });
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/stripe",
      method: "POST",
      rawBody: body,
      headers: { "stripe-signature": `t=${ts},v1=${"00".repeat(32)}` },
      anonymous: true,
    });
    const response = await stripeWebhook(request, context);
    expect(response.status).toBe(401);
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/stripe",
      method: "POST",
      rawBody: "{}",
      anonymous: true,
    });
    const response = await stripeWebhook(request, context);
    expect(response.status).toBe(400);
  });

  it("with valid signature but unknown event type still returns 200", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      id: "evt_1",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1" } },
    });
    const v1 = await signStripe(body, "whsec_test", ts);
    const { context, logs } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/stripe",
      method: "POST",
      rawBody: body,
      headers: { "stripe-signature": `t=${ts},v1=${v1}` },
      anonymous: true,
    });
    const response = await stripeWebhook(request, context);
    expect(response.status).toBe(200);
    const ignoredLog = logs.find((l) =>
      l.messages.some((m) => String(m).includes("Stripe event ignored")),
    );
    expect(ignoredLog).toBeDefined();
  });

  it("payment_failed event is logged at warn", async () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      id: "evt_2",
      type: "invoice.payment_failed",
      data: { object: { id: "in_2", customer: "cus_2" } },
    });
    const v1 = await signStripe(body, "whsec_test", ts);
    const { context, logs } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/stripe",
      method: "POST",
      rawBody: body,
      headers: { "stripe-signature": `t=${ts},v1=${v1}` },
      anonymous: true,
    });
    const response = await stripeWebhook(request, context);
    expect(response.status).toBe(200);
    const warnLog = logs.find(
      (l) =>
        l.level === "warn" &&
        l.messages.some((m) => String(m).includes("payment failed")),
    );
    expect(warnLog).toBeDefined();
  });
});
