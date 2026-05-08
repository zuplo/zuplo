import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import triageRefundRequests from "../modules/mcp-tools/triage-refund-requests.ts";
import forecastAttendance from "../modules/mcp-tools/forecast-attendance.ts";
import issueDiscountForSegment from "../modules/mcp-tools/issue-discount-for-segment.ts";
import getEvent from "../modules/handlers/get-event.ts";
import listOrders from "../modules/handlers/list-orders.ts";
import createDiscount from "../modules/handlers/create-discount.ts";
import { eventRepository } from "../modules/repositories/events.ts";
import { orderRepository } from "../modules/repositories/orders.ts";
import { discountRepository } from "../modules/repositories/discounts.ts";

const routes = {
  "GET /events/:id": getEvent,
  "GET /orders": listOrders,
  "POST /discounts": createDiscount,
};

async function clearAll() {
  for (const repo of [eventRepository, orderRepository, discountRepository]) {
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
});

const SOON = new Date(Date.now() + 5 * 86400000).toISOString();

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


describe("orchestrators/triage_refund_requests", () => {
  it("returns canceled-but-not-refunded orders within the cutoff window", async () => {
    const event = await eventRepository.create("tenant-a", {
      slug: "show",
      name: "Show",
      description: "d",
      venue: "v",
      startsAt: SOON,
      endsAt: SOON,
      capacity: 100,
      ticketsSold: 0,
      status: "on_sale",
    });
    await orderRepository.create("tenant-a", {
      eventId: event.id,
      attendeeEmail: "a@b.com",
      attendeeName: "A",
      totalCents: 5000,
      currency: "USD",
      status: "canceled",
      placedAt: new Date().toISOString(),
      paidAt: null,
      refundedAt: null,
    });
    // Already refunded — must be filtered out.
    await orderRepository.create("tenant-a", {
      eventId: event.id,
      attendeeEmail: "c@d.com",
      attendeeName: "C",
      totalCents: 5000,
      currency: "USD",
      status: "canceled",
      placedAt: new Date().toISOString(),
      paidAt: null,
      refundedAt: new Date().toISOString(),
    });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/triage_refund_requests",
      method: "POST",
      body: { eventId: event.id, daysBeforeEvent: 14 },
      tenantId: "tenant-a",
    });
    const res = await triageRefundRequests(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      count: number;
      inWindow: boolean;
      orders: { attendeeEmail: string }[];
    };
    expect(data.count).toBe(1);
    expect(data.inWindow).toBe(true);
    expect(data.orders[0].attendeeEmail).toBe("a@b.com");
  });

  it("returns 400 when eventId missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/triage_refund_requests",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await triageRefundRequests(request, context);
    expect(res.status).toBe(400);
  });

  it("no-op when there are no canceled orders for the event", async () => {
    const event = await eventRepository.create("tenant-a", {
      slug: "x",
      name: "X",
      description: "d",
      venue: "v",
      startsAt: SOON,
      endsAt: SOON,
      capacity: 100,
      ticketsSold: 0,
      status: "on_sale",
    });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/triage_refund_requests",
      method: "POST",
      body: { eventId: event.id },
      tenantId: "tenant-a",
    });
    const res = await triageRefundRequests(request, context);
    const data = (await res.json()) as { count: number };
    expect(data.count).toBe(0);
  });

  it("isolates tenants — tenant-a's canceled orders don't show for tenant-b", async () => {
    const event = await eventRepository.create("tenant-a", {
      slug: "x",
      name: "X",
      description: "d",
      venue: "v",
      startsAt: SOON,
      endsAt: SOON,
      capacity: 100,
      ticketsSold: 0,
      status: "on_sale",
    });
    await orderRepository.create("tenant-a", {
      eventId: event.id,
      attendeeEmail: "a@b.com",
      attendeeName: "A",
      totalCents: 1000,
      currency: "USD",
      status: "canceled",
      placedAt: new Date().toISOString(),
      paidAt: null,
      refundedAt: null,
    });

    // tenant-b has no event — orchestrator will get a 404 from get_event.
    const { context } = makeContext({ routes, tenantId: "tenant-b" });
    const request = makeRequest({
      url: "https://kit.test/mcp/triage_refund_requests",
      method: "POST",
      body: { eventId: event.id },
      tenantId: "tenant-b",
    });
    await expect(triageRefundRequests(request, context)).rejects.toThrow();
  });
});

describe("orchestrators/forecast_attendance", () => {
  it("computes daily velocity and projects total paid", async () => {
    const startsAt = new Date(Date.now() + 10 * 86400000).toISOString();
    const event = await eventRepository.create("tenant-a", {
      slug: "show",
      name: "Show",
      description: "d",
      venue: "v",
      startsAt,
      endsAt: startsAt,
      capacity: 200,
      ticketsSold: 50,
      status: "on_sale",
    });

    // Spread two paid orders over a 2-day window so velocity is non-zero.
    const day1 = new Date(Date.now() - 2 * 86400000).toISOString();
    const day2 = new Date(Date.now() - 1 * 86400000).toISOString();
    await orderRepository.create("tenant-a", {
      eventId: event.id,
      attendeeEmail: "a@b.com",
      attendeeName: "A",
      totalCents: 1000,
      currency: "USD",
      status: "paid",
      placedAt: day1,
      paidAt: day1,
      refundedAt: null,
    });
    await orderRepository.create("tenant-a", {
      eventId: event.id,
      attendeeEmail: "b@c.com",
      attendeeName: "B",
      totalCents: 1000,
      currency: "USD",
      status: "paid",
      placedAt: day2,
      paidAt: day2,
      refundedAt: null,
    });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/forecast_attendance",
      method: "POST",
      body: { eventId: event.id },
      tenantId: "tenant-a",
    });
    const res = await forecastAttendance(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      paidOrdersToDate: number;
      dailyVelocity: number;
      projectedTotalPaid: number;
      remainingCapacity: number;
    };
    expect(data.paidOrdersToDate).toBe(2);
    expect(data.dailyVelocity).toBeGreaterThan(0);
    expect(data.projectedTotalPaid).toBeGreaterThanOrEqual(2);
    expect(data.remainingCapacity).toBe(150);
  });

  it("returns zero velocity with single paid order", async () => {
    const event = await eventRepository.create("tenant-a", {
      slug: "x",
      name: "X",
      description: "d",
      venue: "v",
      startsAt: SOON,
      endsAt: SOON,
      capacity: 100,
      ticketsSold: 0,
      status: "on_sale",
    });
    await orderRepository.create("tenant-a", {
      eventId: event.id,
      attendeeEmail: "a",
      attendeeName: "A",
      totalCents: 1,
      currency: "USD",
      status: "paid",
      placedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      refundedAt: null,
    });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/forecast_attendance",
      method: "POST",
      body: { eventId: event.id },
      tenantId: "tenant-a",
    });
    const res = await forecastAttendance(request, context);
    const data = (await res.json()) as { dailyVelocity: number; projectedAdditional: number };
    expect(data.dailyVelocity).toBe(0);
    expect(data.projectedAdditional).toBe(0);
  });

  it("returns 400 when eventId missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/forecast_attendance",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await forecastAttendance(request, context);
    expect(res.status).toBe(400);
  });
});

describe("orchestrators/issue_discount_for_segment", () => {
  it("creates a discount with a code derived from segment + timestamp", async () => {
    const event = await eventRepository.create("tenant-a", {
      slug: "x",
      name: "X",
      description: "d",
      venue: "v",
      startsAt: SOON,
      endsAt: SOON,
      capacity: 100,
      ticketsSold: 0,
      status: "on_sale",
    });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/issue_discount_for_segment",
      method: "POST",
      body: {
        eventId: event.id,
        segmentName: "alumni",
        percent: 20,
        max: 50,
      },
      tenantId: "tenant-a",
    });
    const res = await issueDiscountForSegment(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      shareableCode: string;
      discount: { code: string; eventId: string; value: number; maxUses: number };
      segment: string;
    };
    expect(data.shareableCode).toMatch(/^ALUMNI-/);
    expect(data.discount.code).toBe(data.shareableCode);
    expect(data.discount.eventId).toBe(event.id);
    expect(data.discount.value).toBe(20);
    expect(data.discount.maxUses).toBe(50);
    expect(data.segment).toBe("alumni");

    const stored = await discountRepository.list("tenant-a", { limit: 10 });
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0].code).toBe(data.shareableCode);
  });

  it("returns 400 when required fields missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/issue_discount_for_segment",
      method: "POST",
      body: { eventId: "x" },
      tenantId: "tenant-a",
    });
    const res = await issueDiscountForSegment(request, context);
    expect(res.status).toBe(400);
  });

  it("isolates tenants — discount lands in caller tenant only", async () => {
    const eventA = await eventRepository.create("tenant-a", {
      slug: "ax",
      name: "AX",
      description: "d",
      venue: "v",
      startsAt: SOON,
      endsAt: SOON,
      capacity: 100,
      ticketsSold: 0,
      status: "on_sale",
    });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/issue_discount_for_segment",
      method: "POST",
      body: {
        eventId: eventA.id,
        segmentName: "press",
        percent: 100,
        max: 5,
      },
      tenantId: "tenant-a",
    });
    await issueDiscountForSegment(request, context);

    const aDiscounts = await discountRepository.list("tenant-a", { limit: 10 });
    const bDiscounts = await discountRepository.list("tenant-b", { limit: 10 });
    expect(aDiscounts.items).toHaveLength(1);
    expect(bDiscounts.items).toHaveLength(0);
  });
});
