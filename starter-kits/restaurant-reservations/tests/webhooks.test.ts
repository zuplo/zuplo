import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import webhookStripe from "../modules/handlers/webhook-stripe.ts";
import { makeContext } from "@zuplo/starter-kit-shared/testing";
import { reservationRepository } from "../modules/repositories/reservations.ts";

const SECRET = "whsec_rest";

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
  const sig = await stripeSign(rawBody, SECRET, ts);
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
  for (const tenantId of ["tenant-a", "tenant-b"]) {
    const page = await reservationRepository.list(tenantId, { limit: 200 });
    for (const item of page.items) {
      await reservationRepository.delete(tenantId, item.id);
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


describe("webhooks/stripe (restaurant-reservations)", () => {
  it("checkout.session.completed flips depositStatus to paid", async () => {
    const reservation = await reservationRepository.create("tenant-a", {
      guestId: "g1",
      scheduledFor: new Date(Date.now() + 86400000).toISOString(),
      partySize: 2,
      durationMinutes: 90,
      tableId: null,
      status: "confirmed",
      specialRequests: null,
      source: "web",
      confirmedAt: new Date().toISOString(),
      seatedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      depositStatus: "pending",
      depositCents: 5000,
    });
    const request = await makeStripeRequest({
      body: {
        id: "evt_1",
        type: "checkout.session.completed",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "cs_1",
            metadata: { tenant_id: "tenant-a", reservation_id: reservation.id },
          },
        },
      },
    });
    const { context } = makeContext({});
    const res = await webhookStripe(request, context);
    expect(res.status).toBe(200);
    const updated = await reservationRepository.get("tenant-a", reservation.id);
    expect(updated?.depositStatus).toBe("paid");
  });

  it("rejects an invalid signature with 401 and does not mutate state", async () => {
    const reservation = await reservationRepository.create("tenant-a", {
      guestId: "g1",
      scheduledFor: new Date(Date.now() + 86400000).toISOString(),
      partySize: 2,
      durationMinutes: 90,
      tableId: null,
      status: "confirmed",
      specialRequests: null,
      source: "web",
      confirmedAt: new Date().toISOString(),
      seatedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      depositStatus: "pending",
      depositCents: 5000,
    });
    const rawBody = JSON.stringify({
      id: "evt_x",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: "cs_x", metadata: { tenant_id: "tenant-a", reservation_id: reservation.id } } },
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
    const after = await reservationRepository.get("tenant-a", reservation.id);
    expect(after?.depositStatus).toBe("pending");
  });

  it("acks unknown event types with 200", async () => {
    const request = await makeStripeRequest({
      body: {
        id: "evt_2",
        type: "customer.created",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "cus_x",
            metadata: { tenant_id: "tenant-a", reservation_id: "r-x" },
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

  it("checkout.session.expired flips depositStatus to refunded", async () => {
    const reservation = await reservationRepository.create("tenant-a", {
      guestId: "g1",
      scheduledFor: new Date(Date.now() + 86400000).toISOString(),
      partySize: 2,
      durationMinutes: 90,
      tableId: null,
      status: "confirmed",
      specialRequests: null,
      source: "web",
      confirmedAt: new Date().toISOString(),
      seatedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      depositStatus: "pending",
      depositCents: 5000,
    });
    const request = await makeStripeRequest({
      body: {
        id: "evt_3",
        type: "checkout.session.expired",
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: "cs_e",
            metadata: { tenant_id: "tenant-a", reservation_id: reservation.id },
          },
        },
      },
    });
    const { context } = makeContext({});
    const res = await webhookStripe(request, context);
    expect(res.status).toBe(200);
    const after = await reservationRepository.get("tenant-a", reservation.id);
    expect(after?.depositStatus).toBe("refunded");
  });

  it("ignores events without tenant_id/reservation_id metadata", async () => {
    const request = await makeStripeRequest({
      body: {
        id: "evt_4",
        type: "checkout.session.completed",
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: "cs_y", metadata: {} } },
      },
    });
    const { context } = makeContext({});
    const res = await webhookStripe(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ignored: string };
    expect(data.ignored).toBe("no_tenant_or_reservation_metadata");
  });
});
