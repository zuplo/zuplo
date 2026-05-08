import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import webhookStripe from "../modules/handlers/webhook-stripe.ts";
import webhookShipengine from "../modules/handlers/webhook-shipengine.ts";
import { makeContext } from "@zuplo/starter-kit-shared/testing";
import { orderRepository } from "../modules/repositories/orders.ts";
import { shipmentRepository } from "../modules/repositories/shipments.ts";

const STRIPE_SECRET = "whsec_e2e";
const SHIPENGINE_SECRET = "se_shared_secret";

async function stripeSign(body: string, secret: string, ts: number): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${body}`));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function makeStripeRequest(args: { body: object }): Promise<import("@zuplo/runtime").ZuploRequest> {
  const ts = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify(args.body);
  const sig = await stripeSign(rawBody, STRIPE_SECRET, ts);
  const headers = new Headers({
    "content-type": "application/json",
    "stripe-signature": `t=${ts},v1=${sig}`,
  });
  return new Request("https://kit.test/webhooks/stripe", {
    method: "POST",
    headers,
    body: rawBody,
  }) as unknown as import("@zuplo/runtime").ZuploRequest;
}

async function clearAll() {
  for (const repo of [orderRepository, shipmentRepository]) {
    for (const tenantId of ["tenant-a", "tenant-b", "default"]) {
      const page = await repo.list(tenantId, { limit: 200 });
      for (const item of page.items) {
        await repo.delete(tenantId, item.id);
      }
    }
  }
}

beforeEach(async () => {
  await clearAll();
  setEnv("STRIPE_WEBHOOK_SECRET", STRIPE_SECRET);
  setEnv("SHIPENGINE_WEBHOOK_SECRET", SHIPENGINE_SECRET);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await clearAll();
  setEnv("STRIPE_WEBHOOK_SECRET", undefined);
  setEnv("SHIPENGINE_WEBHOOK_SECRET", undefined);
  setEnv("TWILIO_ACCOUNT_SID", undefined);
  setEnv("TWILIO_AUTH_TOKEN", undefined);
  setEnv("TWILIO_FROM_NUMBER", undefined);
  setEnv("DEFAULT_TENANT_ID", undefined);
});

const env = environment as Record<string, string | undefined>;

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete env[name];
    delete process.env[name];
  } else {
    env[name] = value;
    process.env[name] = value;
  }
}


describe("webhooks/stripe (ecommerce-order-ops)", () => {
  it("payment_intent.succeeded flips order to paid and stores PI id", async () => {
    const order = await orderRepository.create("tenant-a", {
      customerId: "c1",
      orderNumber: "O-1",
      status: "pending",
      subtotalCents: 100,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 100,
      currency: "USD",
      placedAt: new Date().toISOString(),
      paidAt: null,
      shippedAt: null,
      fraudScore: 1,
      channel: "web",
    });
    const request = await makeStripeRequest({
      body: {
        id: "evt_1",
        type: "payment_intent.succeeded",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "pi_1",
            metadata: { tenant_id: "tenant-a", order_id: order.id },
          },
        },
      },
    });
    const { context } = makeContext({});
    const res = await webhookStripe(request, context);
    expect(res.status).toBe(200);
    const updated = await orderRepository.get("tenant-a", order.id);
    expect(updated?.status).toBe("paid");
    expect(updated?.paidAt).toBeTruthy();
    expect(updated?.stripePaymentIntentId).toBe("pi_1");
  });

  it("rejects an invalid signature with 401 and does not mutate state", async () => {
    const order = await orderRepository.create("tenant-a", {
      customerId: "c1",
      orderNumber: "O-1",
      status: "pending",
      subtotalCents: 100,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 100,
      currency: "USD",
      placedAt: new Date().toISOString(),
      paidAt: null,
      shippedAt: null,
      fraudScore: 1,
      channel: "web",
    });
    const rawBody = JSON.stringify({
      id: "evt_1",
      type: "payment_intent.succeeded",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: "pi_1", metadata: { tenant_id: "tenant-a", order_id: order.id } } },
    });
    const headers = new Headers({
      "content-type": "application/json",
      "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=DEADBEEF`,
    });
    const request = new Request("https://kit.test/webhooks/stripe", {
      method: "POST",
      headers,
      body: rawBody,
    }) as unknown as import("@zuplo/runtime").ZuploRequest;
    const { context } = makeContext({});
    const res = await webhookStripe(request, context);
    expect(res.status).toBe(401);
    const after = await orderRepository.get("tenant-a", order.id);
    expect(after?.status).toBe("pending");
  });

  it("acks unknown event type with 200 and ignored marker", async () => {
    const request = await makeStripeRequest({
      body: {
        id: "evt_1",
        type: "customer.created",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "cus_1",
            metadata: { tenant_id: "tenant-a", order_id: "o1" },
          },
        },
      },
    });
    const { context } = makeContext({});
    const res = await webhookStripe(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ignored: string };
    expect(data.ignored).toBe("customer.created");
  });
});

describe("webhooks/shipengine", () => {
  function makeSeRequest(args: {
    body: object;
    secret?: string | null;
    tenantHeader?: string;
  }): import("@zuplo/runtime").ZuploRequest {
    const headers = new Headers({ "content-type": "application/json" });
    if (args.secret !== null) {
      headers.set("x-shipengine-secret", args.secret ?? SHIPENGINE_SECRET);
    }
    if (args.tenantHeader) headers.set("x-tenant-id", args.tenantHeader);
    return new Request("https://kit.test/webhooks/shipengine", {
      method: "POST",
      headers,
      body: JSON.stringify(args.body),
    }) as unknown as import("@zuplo/runtime").ZuploRequest;
  }

  it("API_TRACK with status DE flips shipment to delivered + sends Twilio SMS to buyer", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    setEnv("TWILIO_FROM_NUMBER", "+15555550100");
    const order = await orderRepository.create("tenant-a", {
      customerId: "c1",
      orderNumber: "O-99",
      status: "shipped",
      subtotalCents: 1,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 1,
      currency: "USD",
      placedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      shippedAt: new Date().toISOString(),
      fraudScore: 1,
      channel: "web",
      buyerPhone: "+15555550101",
    });
    const shipment = await shipmentRepository.create("tenant-a", {
      orderId: order.id,
      carrier: "USPS",
      service: "Priority",
      trackingNumber: "1Z9999",
      status: "in_transit",
      shippedAt: new Date().toISOString(),
      deliveredAt: null,
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sid: "SM1",
          status: "queued",
          to: "+15555550101",
          from: "+15555550100",
          body: "x",
          date_created: "x",
          date_updated: "x",
          num_segments: "1",
        }),
        { status: 201 },
      ),
    );

    const request = makeSeRequest({
      body: {
        resource_url: "x",
        resource_type: "API_TRACK",
        data: {
          tracking_number: "1Z9999",
          carrier_code: "usps",
          status_code: "DE",
          status_description: "Delivered",
          events: [],
        },
      },
      tenantHeader: "tenant-a",
    });
    const { context } = makeContext({});
    const res = await webhookShipengine(request, context);
    expect(res.status).toBe(200);

    const updated = await shipmentRepository.get("tenant-a", shipment.id);
    expect(updated?.status).toBe("delivered");
    expect(updated?.deliveredAt).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("api.twilio.com");
    const params = new URLSearchParams((init as RequestInit).body as string);
    expect(params.get("To")).toBe("+15555550101");
    expect(params.get("Body")).toMatch(/delivered/i);
  });

  it("rejects when shared secret is invalid", async () => {
    const request = makeSeRequest({
      body: { resource_type: "API_TRACK", data: { tracking_number: "x" } },
      secret: "wrong-secret",
      tenantHeader: "tenant-a",
    });
    const { context } = makeContext({});
    const res = await webhookShipengine(request, context);
    expect(res.status).toBe(401);
  });

  it("ignores resource types other than API_TRACK with 200", async () => {
    const request = makeSeRequest({
      body: { resource_type: "API_LABEL", data: {} },
      tenantHeader: "tenant-a",
    });
    const { context } = makeContext({});
    const res = await webhookShipengine(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ignored: string };
    expect(data.ignored).toBe("API_LABEL");
  });

  it("returns ignored when there's no matching shipment for tracking number", async () => {
    const request = makeSeRequest({
      body: {
        resource_type: "API_TRACK",
        data: { tracking_number: "MISSING-1Z" },
      },
      tenantHeader: "tenant-a",
    });
    const { context } = makeContext({});
    const res = await webhookShipengine(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ignored: string };
    expect(data.ignored).toBe("no_matching_shipment");
  });
});
