import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import webhookStripe from "../modules/handlers/webhook-stripe.ts";
import { makeContext } from "@zuplo/starter-kit-shared/testing";
import { orderRepository } from "../modules/repositories/orders.ts";
import { ticketRepository } from "../modules/repositories/tickets.ts";
import { eventRepository } from "../modules/repositories/events.ts";

const SECRET = "whsec_test_secret";

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

async function makeStripeRequest(args: {
  body: object;
  secret?: string;
  ts?: number;
}): Promise<{ request: import("@zuplo/runtime").ZuploRequest; rawBody: string }> {
  const ts = args.ts ?? Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify(args.body);
  const sig = await stripeSign(rawBody, args.secret ?? SECRET, ts);
  const headers = new Headers({
    "content-type": "application/json",
    "stripe-signature": `t=${ts},v1=${sig}`,
  });
  const r = new Request("https://kit.test/webhooks/stripe", {
    method: "POST",
    headers,
    body: rawBody,
  }) as unknown as import("@zuplo/runtime").ZuploRequest;
  return { request: r, rawBody };
}

async function clearAll() {
  for (const repo of [orderRepository, ticketRepository, eventRepository]) {
    for (const tenantId of ["tenant-a", "tenant-b"]) {
      const page = await repo.list(tenantId, { limit: 200 });
      for (const item of page.items) {
        await repo.delete(tenantId, item.id);
      }
    }
  }
}

beforeEach(async () => {
  await clearAll();
  setEnv("STRIPE_WEBHOOK_SECRET", SECRET);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await clearAll();
  setEnv("STRIPE_WEBHOOK_SECRET", undefined);
  setEnv("RESEND_API_KEY", undefined);
  setEnv("RESEND_FROM_EMAIL", undefined);
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


describe("webhooks/stripe", () => {
  it("payment_intent.succeeded flips order to paid, mints a ticket, attempts Resend send", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "tix@kit.test");
    const event = await eventRepository.create("tenant-a", {
      slug: "show",
      name: "Show",
      description: "d",
      venue: "Hall",
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      endsAt: new Date(Date.now() + 86400000).toISOString(),
      capacity: 100,
      ticketsSold: 0,
      status: "on_sale",
    });
    const order = await orderRepository.create("tenant-a", {
      eventId: event.id,
      attendeeEmail: "buyer@example.com",
      attendeeName: "Ada",
      totalCents: 5000,
      currency: "USD",
      status: "pending",
      placedAt: new Date().toISOString(),
      paidAt: null,
      refundedAt: null,
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "em_1" }), { status: 200 }),
    );

    const { request } = await makeStripeRequest({
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

    const ticketsPage = await ticketRepository.list("tenant-a", { limit: 5 });
    expect(ticketsPage.items).toHaveLength(1);
    expect(ticketsPage.items[0].orderId).toBe(order.id);
    expect(ticketsPage.items[0].attendeeEmail).toBe("buyer@example.com");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [resendUrl, resendInit] = fetchMock.mock.calls[0]!;
    expect(resendUrl).toBe("https://api.resend.com/emails");
    const body = JSON.parse((resendInit as RequestInit).body as string);
    expect(body.to).toBe("buyer@example.com");
    expect(body.subject).toContain("Show");
  });

  it("rejects an invalid signature with 401 and does not mutate state", async () => {
    const order = await orderRepository.create("tenant-a", {
      eventId: "evt-x",
      attendeeEmail: "a",
      attendeeName: "A",
      totalCents: 100,
      currency: "USD",
      status: "pending",
      placedAt: new Date().toISOString(),
      paidAt: null,
      refundedAt: null,
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

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({});
    const res = await webhookStripe(request, context);
    expect(res.status).toBe(401);

    const after = await orderRepository.get("tenant-a", order.id);
    expect(after?.status).toBe("pending");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("acks unknown event types without mutating state", async () => {
    const order = await orderRepository.create("tenant-a", {
      eventId: "evt-x",
      attendeeEmail: "a",
      attendeeName: "A",
      totalCents: 100,
      currency: "USD",
      status: "pending",
      placedAt: new Date().toISOString(),
      paidAt: null,
      refundedAt: null,
    });
    const { request } = await makeStripeRequest({
      body: {
        id: "evt_unknown",
        type: "checkout.session.completed",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "cs_1",
            metadata: { tenant_id: "tenant-a", order_id: order.id },
          },
        },
      },
    });
    const { context } = makeContext({});
    const res = await webhookStripe(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ignored: string };
    expect(data.ignored).toBe("checkout.session.completed");

    const after = await orderRepository.get("tenant-a", order.id);
    expect(after?.status).toBe("pending");
  });

  it("ignores events that lack tenant_id/order_id metadata", async () => {
    const { request } = await makeStripeRequest({
      body: {
        id: "evt_2",
        type: "payment_intent.succeeded",
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: "pi_x", metadata: {} } },
      },
    });
    const { context } = makeContext({});
    const res = await webhookStripe(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ignored: string };
    expect(data.ignored).toBe("no_tenant_or_order_metadata");
  });

  it("payment_intent.payment_failed marks the order canceled", async () => {
    const order = await orderRepository.create("tenant-a", {
      eventId: "evt-x",
      attendeeEmail: "a",
      attendeeName: "A",
      totalCents: 100,
      currency: "USD",
      status: "pending",
      placedAt: new Date().toISOString(),
      paidAt: null,
      refundedAt: null,
    });
    const { request } = await makeStripeRequest({
      body: {
        id: "evt_3",
        type: "payment_intent.payment_failed",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "pi_f",
            metadata: { tenant_id: "tenant-a", order_id: order.id },
          },
        },
      },
    });
    const { context } = makeContext({});
    const res = await webhookStripe(request, context);
    expect(res.status).toBe(200);
    const updated = await orderRepository.get("tenant-a", order.id);
    expect(updated?.status).toBe("canceled");
  });

  it("charge.refunded marks the order refunded", async () => {
    const order = await orderRepository.create("tenant-a", {
      eventId: "evt-x",
      attendeeEmail: "a",
      attendeeName: "A",
      totalCents: 100,
      currency: "USD",
      status: "paid",
      placedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      refundedAt: null,
    });
    const { request } = await makeStripeRequest({
      body: {
        id: "evt_4",
        type: "charge.refunded",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "ch_x",
            metadata: { tenant_id: "tenant-a", order_id: order.id },
          },
        },
      },
    });
    const { context } = makeContext({});
    const res = await webhookStripe(request, context);
    expect(res.status).toBe(200);
    const updated = await orderRepository.get("tenant-a", order.id);
    expect(updated?.status).toBe("refunded");
    expect(updated?.refundedAt).toBeTruthy();
  });
});
