import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import pickCarrierForDestination from "../modules/mcp-tools/pick-carrier-for-destination.ts";
import triageHighRiskOrders from "../modules/mcp-tools/triage-high-risk-orders.ts";
import autoApproveReturnsUnderPolicy from "../modules/mcp-tools/auto-approve-returns-under-policy.ts";
import getOrder from "../modules/handlers/get-order.ts";
import listOrders from "../modules/handlers/list-orders.ts";
import listCustomers from "../modules/handlers/list-customers.ts";
import listReturns from "../modules/handlers/list-returns.ts";
import approveReturn from "../modules/handlers/approve-return.ts";
import { orderRepository } from "../modules/repositories/orders.ts";
import { customerRepository } from "../modules/repositories/customers.ts";
import { returnRepository } from "../modules/repositories/returns.ts";

const routes = {
  "GET /orders": listOrders,
  "GET /orders/:id": getOrder,
  "GET /customers": listCustomers,
  "GET /returns": listReturns,
  "POST /returns/:id/approve": approveReturn,
};

async function clearAll() {
  for (const repo of [orderRepository, customerRepository, returnRepository]) {
    for (const tenantId of ["tenant-a", "tenant-b"]) {
      const page = await repo.list(tenantId, { limit: 200 });
      for (const item of page.items) {
        await repo.delete(tenantId, item.id);
      }
    }
  }
}

beforeEach(clearAll);
afterEach(async () => {
  vi.restoreAllMocks();
  await clearAll();
  setEnv("SHIPENGINE_API_KEY", undefined);
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


describe("orchestrators/pick_carrier_for_destination", () => {
  it("rate-shops via ShipEngine and picks the cheapest by default", async () => {
    setEnv("SHIPENGINE_API_KEY", "se_x");
    const customer = await customerRepository.create("tenant-a", {
      email: "a@b.com",
      firstName: "A",
      lastName: "B",
      totalOrders: 1,
      totalSpentCents: 1000,
      vipTier: "none",
    });
    const order = await orderRepository.create("tenant-a", {
      customerId: customer.id,
      orderNumber: "O-1",
      status: "paid",
      subtotalCents: 1000,
      shippingCents: 500,
      taxCents: 0,
      totalCents: 1500,
      currency: "USD",
      placedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      shippedAt: null,
      fraudScore: 1,
      channel: "web",
      shipToName: "A B",
      shipToAddressLine1: "100 Pine",
      shipToCityLocality: "Seattle",
      shipToStateProvince: "WA",
      shipToPostalCode: "98101",
      shipToCountryCode: "US",
      parcelWeightOz: 12,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          rate_response: {
            rates: [
              {
                rate_id: "rate_a",
                carrier_id: "ups",
                carrier_friendly_name: "UPS",
                service_type: "Ground",
                service_code: "ups_ground",
                shipping_amount: { amount: 12.0, currency: "USD" },
                estimated_delivery_date: null,
                delivery_days: 5,
                trackable: true,
              },
              {
                rate_id: "rate_b",
                carrier_id: "usps",
                carrier_friendly_name: "USPS",
                service_type: "Priority",
                service_code: "usps_priority",
                shipping_amount: { amount: 7.5, currency: "USD" },
                estimated_delivery_date: null,
                delivery_days: 2,
                trackable: true,
              },
            ],
            invalid_rates: [],
            rate_request_id: "x",
            shipment_id: "x",
            created_at: "x",
            status: "completed",
          },
        }),
        { status: 200 },
      ),
    );

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/pick_carrier_for_destination",
      method: "POST",
      body: { orderId: order.id },
      tenantId: "tenant-a",
    });
    const res = await pickCarrierForDestination(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      rateId: string;
      recommendedCarrier: string;
      reasons: string[];
    };
    expect(data.rateId).toBe("rate_b");
    expect(data.recommendedCarrier).toBe("USPS");
    expect(data.reasons[0]).toMatch(/cheapest/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("picks fastest for VIP gold customer (cascade: Mapbox-not-here, ShipEngine rate shop + customer tier)", async () => {
    setEnv("SHIPENGINE_API_KEY", "se_x");
    const customer = await customerRepository.create("tenant-a", {
      email: "v@i.p",
      firstName: "V",
      lastName: "P",
      totalOrders: 50,
      totalSpentCents: 500000,
      vipTier: "gold",
    });
    const order = await orderRepository.create("tenant-a", {
      customerId: customer.id,
      orderNumber: "O-2",
      status: "paid",
      subtotalCents: 1000,
      shippingCents: 500,
      taxCents: 0,
      totalCents: 1500,
      currency: "USD",
      placedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      shippedAt: null,
      fraudScore: 1,
      channel: "web",
      shipToName: "VIP",
      shipToAddressLine1: "1 Park",
      shipToCityLocality: "NYC",
      shipToStateProvince: "NY",
      shipToPostalCode: "10001",
      shipToCountryCode: "US",
      parcelWeightOz: 8,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          rate_response: {
            rates: [
              {
                rate_id: "slow",
                carrier_id: "u",
                carrier_friendly_name: "UPS",
                service_type: "Ground",
                service_code: "ups_ground",
                shipping_amount: { amount: 5.0, currency: "USD" },
                estimated_delivery_date: null,
                delivery_days: 5,
                trackable: true,
              },
              {
                rate_id: "fast",
                carrier_id: "f",
                carrier_friendly_name: "FedEx",
                service_type: "Overnight",
                service_code: "fedex_overnight",
                shipping_amount: { amount: 50.0, currency: "USD" },
                estimated_delivery_date: null,
                delivery_days: 1,
                trackable: true,
              },
            ],
            invalid_rates: [],
            rate_request_id: "x",
            shipment_id: "x",
            created_at: "x",
            status: "completed",
          },
        }),
        { status: 200 },
      ),
    );

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/pick_carrier_for_destination",
      method: "POST",
      body: { orderId: order.id },
      tenantId: "tenant-a",
    });
    const res = await pickCarrierForDestination(request, context);
    const data = (await res.json()) as { rateId: string; reasons: string[] };
    expect(data.rateId).toBe("fast");
    expect(data.reasons[0]).toMatch(/VIP/);
  });

  it("falls back to rules-only when ShipEngine is not configured", async () => {
    setEnv("SHIPENGINE_API_KEY", undefined);
    const customer = await customerRepository.create("tenant-a", {
      email: "v@i.p",
      firstName: "V",
      lastName: "P",
      totalOrders: 50,
      totalSpentCents: 500000,
      vipTier: "gold",
    });
    const order = await orderRepository.create("tenant-a", {
      customerId: customer.id,
      orderNumber: "O-3",
      status: "paid",
      subtotalCents: 1000,
      shippingCents: 500,
      taxCents: 0,
      totalCents: 1500,
      currency: "USD",
      placedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      shippedAt: null,
      fraudScore: 1,
      channel: "web",
      shipToName: null,
      shipToAddressLine1: null,
      shipToCityLocality: null,
      shipToStateProvince: null,
      shipToPostalCode: null,
      shipToCountryCode: null,
      parcelWeightOz: null,
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/pick_carrier_for_destination",
      method: "POST",
      body: { orderId: order.id },
      tenantId: "tenant-a",
    });
    const res = await pickCarrierForDestination(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      rateId: string | null;
      recommendedCarrier: string;
      reasons: string[];
    };
    expect(data.rateId).toBeNull();
    expect(data.recommendedCarrier).toBe("FedEx"); // VIP gold rule
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 when ShipEngine throws (cascade: stop on rate shop failure)", async () => {
    setEnv("SHIPENGINE_API_KEY", "se_x");
    const customer = await customerRepository.create("tenant-a", {
      email: "x@y.com",
      firstName: "X",
      lastName: "Y",
      totalOrders: 0,
      totalSpentCents: 0,
      vipTier: "none",
    });
    const order = await orderRepository.create("tenant-a", {
      customerId: customer.id,
      orderNumber: "O-4",
      status: "paid",
      subtotalCents: 1000,
      shippingCents: 500,
      taxCents: 0,
      totalCents: 1500,
      currency: "USD",
      placedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      shippedAt: null,
      fraudScore: 1,
      channel: "web",
      shipToName: "X",
      shipToAddressLine1: "1 main",
      shipToCityLocality: "Reno",
      shipToStateProvince: "NV",
      shipToPostalCode: "89501",
      shipToCountryCode: "US",
      parcelWeightOz: 1,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream down", { status: 503 }),
    );
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/pick_carrier_for_destination",
      method: "POST",
      body: { orderId: order.id },
      tenantId: "tenant-a",
    });
    const res = await pickCarrierForDestination(request, context);
    expect(res.status).toBe(502);
  });

  it("returns 400 when orderId missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/pick_carrier_for_destination",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await pickCarrierForDestination(request, context);
    expect(res.status).toBe(400);
  });
});

describe("orchestrators/triage_high_risk_orders", () => {
  it("returns paid orders above the fraud threshold that haven't shipped", async () => {
    await orderRepository.create("tenant-a", {
      customerId: "c1",
      orderNumber: "O-A",
      status: "paid",
      subtotalCents: 1,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 1,
      currency: "USD",
      placedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      shippedAt: null,
      fraudScore: 80,
      channel: "web",
    });
    await orderRepository.create("tenant-a", {
      customerId: "c1",
      orderNumber: "O-B",
      status: "paid",
      subtotalCents: 1,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 1,
      currency: "USD",
      placedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      shippedAt: new Date().toISOString(), // already shipped
      fraudScore: 95,
      channel: "web",
    });
    await orderRepository.create("tenant-a", {
      customerId: "c1",
      orderNumber: "O-C",
      status: "paid",
      subtotalCents: 1,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 1,
      currency: "USD",
      placedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      shippedAt: null,
      fraudScore: 30, // below threshold
      channel: "web",
    });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/triage_high_risk_orders",
      method: "POST",
      body: { fraudScoreThreshold: 70 },
      tenantId: "tenant-a",
    });
    const res = await triageHighRiskOrders(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { count: number; orders: { orderNumber: string }[] };
    expect(data.count).toBe(1);
    expect(data.orders[0].orderNumber).toBe("O-A");
  });

  it("isolates tenants — tenant-a high-risk orders not visible to tenant-b", async () => {
    await orderRepository.create("tenant-a", {
      customerId: "c1",
      orderNumber: "O-A",
      status: "paid",
      subtotalCents: 1,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 1,
      currency: "USD",
      placedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      shippedAt: null,
      fraudScore: 90,
      channel: "web",
    });
    const { context } = makeContext({ routes, tenantId: "tenant-b" });
    const request = makeRequest({
      url: "https://kit.test/mcp/triage_high_risk_orders",
      method: "POST",
      body: {},
      tenantId: "tenant-b",
    });
    const res = await triageHighRiskOrders(request, context);
    const data = (await res.json()) as { count: number };
    expect(data.count).toBe(0);
  });

  it("returns no-op when no paid orders exist", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/triage_high_risk_orders",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await triageHighRiskOrders(request, context);
    const data = (await res.json()) as { count: number };
    expect(data.count).toBe(0);
  });
});

describe("orchestrators/auto_approve_returns_under_policy", () => {
  it("approves only returns whose orders are under threshold and within window", async () => {
    const order1 = await orderRepository.create("tenant-a", {
      customerId: "c1",
      orderNumber: "O-1",
      status: "paid",
      subtotalCents: 5000,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 5000,
      currency: "USD",
      placedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      shippedAt: null,
      fraudScore: 1,
      channel: "web",
    });
    const order2 = await orderRepository.create("tenant-a", {
      customerId: "c1",
      orderNumber: "O-2",
      status: "paid",
      subtotalCents: 50000,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 50000, // above default threshold
      currency: "USD",
      placedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      shippedAt: null,
      fraudScore: 1,
      channel: "web",
    });
    const ret1 = await returnRepository.create("tenant-a", {
      orderId: order1.id,
      lineItemId: "li1",
      quantity: 1,
      reason: "didn't fit",
      status: "requested",
      requestedAt: new Date().toISOString(),
      refundedAt: null,
    });
    await returnRepository.create("tenant-a", {
      orderId: order2.id,
      lineItemId: "li2",
      quantity: 1,
      reason: "expensive",
      status: "requested",
      requestedAt: new Date().toISOString(),
      refundedAt: null,
    });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/auto_approve_returns_under_policy",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await autoApproveReturnsUnderPolicy(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      approvedCount: number;
      skippedCount: number;
      approved: { id: string; status: string }[];
    };
    expect(data.approvedCount).toBe(1);
    expect(data.skippedCount).toBe(1);
    expect(data.approved[0].id).toBe(ret1.id);

    // Verify the actual side effect — the return is now approved.
    const persisted = await returnRepository.get("tenant-a", ret1.id);
    expect(persisted?.status).toBe("approved");
  });

  it("no-op when no returns are in 'requested' state", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/auto_approve_returns_under_policy",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await autoApproveReturnsUnderPolicy(request, context);
    const data = (await res.json()) as { candidatesScanned: number; approvedCount: number };
    expect(data.candidatesScanned).toBe(0);
    expect(data.approvedCount).toBe(0);
  });

  it("isolates tenants — does not approve another tenant's returns", async () => {
    const order = await orderRepository.create("tenant-a", {
      customerId: "c",
      orderNumber: "O",
      status: "paid",
      subtotalCents: 100,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 100,
      currency: "USD",
      placedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      shippedAt: null,
      fraudScore: 1,
      channel: "web",
    });
    await returnRepository.create("tenant-a", {
      orderId: order.id,
      lineItemId: "li",
      quantity: 1,
      reason: "x",
      status: "requested",
      requestedAt: new Date().toISOString(),
      refundedAt: null,
    });

    const { context } = makeContext({ routes, tenantId: "tenant-b" });
    const request = makeRequest({
      url: "https://kit.test/mcp/auto_approve_returns_under_policy",
      method: "POST",
      body: {},
      tenantId: "tenant-b",
    });
    const res = await autoApproveReturnsUnderPolicy(request, context);
    const data = (await res.json()) as { approvedCount: number };
    expect(data.approvedCount).toBe(0);
  });
});
