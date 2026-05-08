import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import createReservation from "../modules/handlers/create-reservation.ts";
import recoverNoShowRevenue from "../modules/mcp-tools/recover-no-show-revenue.ts";
import recognizeVipGuest from "../modules/mcp-tools/recognize-vip-guest.ts";
import optimizeFloorPlanForShift from "../modules/mcp-tools/optimize-floor-plan-for-shift.ts";
import listReservations from "../modules/handlers/list-reservations.ts";
import listWaitlist from "../modules/handlers/list-waitlist.ts";
import listShifts from "../modules/handlers/list-shifts.ts";
import listTables from "../modules/handlers/list-tables.ts";
import getReservation from "../modules/handlers/get-reservation.ts";
import { reservationRepository } from "../modules/repositories/reservations.ts";
import { guestRepository } from "../modules/repositories/guests.ts";
import { tableRepository } from "../modules/repositories/tables.ts";
import { shiftRepository } from "../modules/repositories/shifts.ts";
import { waitlistRepository } from "../modules/repositories/waitlist.ts";
import { guestNoteRepository } from "../modules/repositories/guest-notes.ts";

const routes = {
  "GET /reservations": listReservations,
  "GET /reservations/:id": getReservation,
  "GET /waitlist": listWaitlist,
  "GET /shifts": listShifts,
  "GET /tables": listTables,
};

async function clearAll() {
  for (const repo of [
    reservationRepository,
    guestRepository,
    tableRepository,
    shiftRepository,
    waitlistRepository,
    guestNoteRepository,
  ]) {
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
  setEnv("STRIPE_SECRET_KEY", undefined);
  setEnv("GOOGLE_ACCESS_TOKEN", undefined);
  setEnv("GOOGLE_CALENDAR_ID", undefined);
  setEnv("TWILIO_ACCOUNT_SID", undefined);
  setEnv("TWILIO_AUTH_TOKEN", undefined);
  setEnv("TWILIO_FROM_NUMBER", undefined);
  setEnv("RESTAURANT_NAME", undefined);
  setEnv("RESTAURANT_TIMEZONE", undefined);
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


describe("orchestrators/create_reservation (multi-fan-out: GCal + Stripe + Twilio)", () => {
  it("when all integrations configured, fans out to Google Calendar, Stripe Checkout, and Twilio", async () => {
    setEnv("STRIPE_SECRET_KEY", "sk_test");
    setEnv("GOOGLE_ACCESS_TOKEN", "ya29.token");
    setEnv("GOOGLE_CALENDAR_ID", "primary");
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    setEnv("TWILIO_FROM_NUMBER", "+15555550100");
    setEnv("RESTAURANT_NAME", "Casa");

    const guest = await guestRepository.create("tenant-a", {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "+15555550101",
      totalVisits: 0,
      lastVisitAt: null,
      vip: false,
      allergies: [],
      preferences: null,
      notes: null,
    });

    // Stub fetch — sequence: Google → Stripe → Twilio (matches order in handler).
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            id: "gcal_evt_1",
            status: "confirmed",
            htmlLink: "https://cal/x",
            start: {},
            end: {},
            summary: "x",
          }),
          { status: 200 },
        );
      })
      .mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            id: "cs_1",
            url: "https://checkout.stripe.com/c/cs_1",
            payment_intent: null,
            payment_status: "unpaid",
            status: "open",
            metadata: {},
          }),
          { status: 200 },
        );
      })
      .mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            sid: "SM1",
            status: "queued",
            to: "+15555550101",
            from: "+15555550100",
            body: "x",
            date_created: "x",
          }),
          { status: 201 },
        );
      });

    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/reservations",
      method: "POST",
      body: {
        guestId: guest.id,
        scheduledFor: new Date(Date.now() + 86400000).toISOString(),
        partySize: 4,
        durationMinutes: 90,
        depositCents: 5000,
        depositSuccessUrl: "https://kit.test/ok",
        depositCancelUrl: "https://kit.test/cancel",
      },
      tenantId: "tenant-a",
    });
    const res = await createReservation(request, context);
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      id: string;
      calendarEventId: string | null;
      depositSessionId: string | null;
      depositUrl: string | null;
    };
    expect(data.calendarEventId).toBe("gcal_evt_1");
    expect(data.depositSessionId).toBe("cs_1");
    expect(data.depositUrl).toBe("https://checkout.stripe.com/c/cs_1");

    // All three integrations called.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls[0]).toContain("googleapis.com/calendar");
    expect(calls[1]).toContain("api.stripe.com/v1/checkout/sessions");
    expect(calls[2]).toContain("api.twilio.com");
  });

  it("degrades gracefully when integrations are not configured (no env vars)", async () => {
    const guest = await guestRepository.create("tenant-a", {
      firstName: "B",
      lastName: "C",
      email: "b@c.com",
      phone: "+1",
      totalVisits: 0,
      lastVisitAt: null,
      vip: false,
      allergies: [],
      preferences: null,
      notes: null,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/reservations",
      method: "POST",
      body: {
        guestId: guest.id,
        scheduledFor: new Date(Date.now() + 86400000).toISOString(),
        partySize: 2,
      },
      tenantId: "tenant-a",
    });
    const res = await createReservation(request, context);
    expect(res.status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("isolates tenants — booking by tenant-a does not appear for tenant-b", async () => {
    const guest = await guestRepository.create("tenant-a", {
      firstName: "X",
      lastName: "Y",
      email: "x@y.com",
      phone: "+1",
      totalVisits: 0,
      lastVisitAt: null,
      vip: false,
      allergies: [],
      preferences: null,
      notes: null,
    });
    const { context } = makeContext({});
    const request = makeRequest({
      url: "https://kit.test/reservations",
      method: "POST",
      body: {
        guestId: guest.id,
        scheduledFor: new Date(Date.now() + 86400000).toISOString(),
        partySize: 2,
      },
      tenantId: "tenant-a",
    });
    await createReservation(request, context);

    const a = await reservationRepository.list("tenant-a", { limit: 10 });
    const b = await reservationRepository.list("tenant-b", { limit: 10 });
    expect(a.items).toHaveLength(1);
    expect(b.items).toHaveLength(0);
  });
});

describe("orchestrators/recover_no_show_revenue", () => {
  it("matches a no-show to a same-size waitlist party and (when notify) sends Twilio SMS", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    setEnv("TWILIO_FROM_NUMBER", "+15555550100");

    const reservedAtIso = new Date(Date.now() - 5 * 60_000).toISOString();
    await reservationRepository.create("tenant-a", {
      guestId: "g1",
      scheduledFor: reservedAtIso,
      partySize: 4,
      durationMinutes: 90,
      tableId: null,
      status: "no_show",
      specialRequests: null,
      source: "web",
      confirmedAt: reservedAtIso,
      seatedAt: null,
      completedAt: null,
      createdAt: reservedAtIso,
    });
    await waitlistRepository.create("tenant-a", {
      guestName: "Walk-in",
      partySize: 4,
      addedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      quotedWaitMinutes: 30,
      status: "waiting",
      quotedReadyAt: null,
      phone: "+15555550101",
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
        }),
        { status: 201 },
      ),
    );

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/recover_no_show_revenue",
      method: "POST",
      body: { notify: true, windowMinutes: 60 },
      tenantId: "tenant-a",
    });
    const res = await recoverNoShowRevenue(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      matchCount: number;
      matches: { smsSid: string | null }[];
    };
    expect(data.matchCount).toBe(1);
    expect(data.matches[0].smsSid).toBe("SM1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT send SMS when notify=false (drafts only)", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    setEnv("TWILIO_FROM_NUMBER", "+15555550100");
    const reservedAtIso = new Date(Date.now() - 5 * 60_000).toISOString();
    await reservationRepository.create("tenant-a", {
      guestId: "g1",
      scheduledFor: reservedAtIso,
      partySize: 2,
      durationMinutes: 60,
      tableId: null,
      status: "no_show",
      specialRequests: null,
      source: "web",
      confirmedAt: reservedAtIso,
      seatedAt: null,
      completedAt: null,
      createdAt: reservedAtIso,
    });
    await waitlistRepository.create("tenant-a", {
      guestName: "Walk-in",
      partySize: 2,
      addedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      quotedWaitMinutes: 10,
      status: "waiting",
      quotedReadyAt: null,
      phone: "+15555550101",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/recover_no_show_revenue",
      method: "POST",
      body: { notify: false, windowMinutes: 60 },
      tenantId: "tenant-a",
    });
    const res = await recoverNoShowRevenue(request, context);
    const data = (await res.json()) as { matchCount: number; matches: { smsSid: string | null }[] };
    expect(data.matchCount).toBe(1);
    expect(data.matches[0].smsSid).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns no matches when waitlist is empty", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/recover_no_show_revenue",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await recoverNoShowRevenue(request, context);
    const data = (await res.json()) as { matchCount: number };
    expect(data.matchCount).toBe(0);
  });
});

describe("orchestrators/recognize_vip_guest", () => {
  it("emits a host briefing including VIP flag, allergies, and visit count", async () => {
    const guest = await guestRepository.create("tenant-a", {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@x",
      phone: "+1",
      totalVisits: 5,
      lastVisitAt: new Date().toISOString(),
      vip: true,
      allergies: ["peanut"],
      preferences: "table near window",
      notes: null,
    });
    const oldRes = await reservationRepository.create("tenant-a", {
      guestId: guest.id,
      scheduledFor: new Date(Date.now() - 7 * 86400000).toISOString(),
      partySize: 2,
      durationMinutes: 90,
      tableId: null,
      status: "completed",
      specialRequests: null,
      source: "web",
      confirmedAt: null,
      seatedAt: null,
      completedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    });
    const reservation = await reservationRepository.create("tenant-a", {
      guestId: guest.id,
      scheduledFor: new Date(Date.now() + 86400000).toISOString(),
      partySize: 4,
      durationMinutes: 90,
      tableId: null,
      status: "confirmed",
      specialRequests: "Anniversary",
      source: "web",
      confirmedAt: new Date().toISOString(),
      seatedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
    });
    await guestNoteRepository.create("tenant-a", {
      guestId: guest.id,
      body: "Loves the tasting menu.",
      addedAt: new Date().toISOString(),
      addedBy: "host",
    });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/recognize_vip_guest",
      method: "POST",
      body: { reservationId: reservation.id },
      tenantId: "tenant-a",
    });
    const res = await recognizeVipGuest(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      isVip: boolean;
      recentVisitCount: number;
      lastVisitAt: string | null;
      briefing: string;
    };
    expect(data.isVip).toBe(true);
    expect(data.recentVisitCount).toBe(1);
    expect(data.lastVisitAt).toBe(oldRes.scheduledFor);
    expect(data.briefing).toContain("Ada Lovelace");
    expect(data.briefing).toContain("VIP");
    expect(data.briefing).toContain("peanut");
    expect(data.briefing).toContain("Anniversary");
  });

  it("returns 400 when reservationId missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/recognize_vip_guest",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await recognizeVipGuest(request, context);
    expect(res.status).toBe(400);
  });

  it("returns 404 when reservation does not exist", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/recognize_vip_guest",
      method: "POST",
      body: { reservationId: "missing" },
      tenantId: "tenant-a",
    });
    const res = await recognizeVipGuest(request, context);
    expect(res.status).toBe(404);
  });
});

describe("orchestrators/optimize_floor_plan_for_shift", () => {
  it("greedy-assigns reservations to the smallest fitting available table", async () => {
    const start = new Date(Date.now() + 60 * 60_000).toISOString();
    const end = new Date(Date.now() + 5 * 60 * 60_000).toISOString();
    const shift = await shiftRepository.create("tenant-a", {
      startsAt: start,
      endsAt: end,
      kind: "dinner",
      expectedCovers: 50,
    });
    await tableRepository.create("tenant-a", {
      number: "T1",
      capacity: 2,
      location: "main",
      status: "available",
    });
    const t4 = await tableRepository.create("tenant-a", {
      number: "T4",
      capacity: 4,
      location: "main",
      status: "available",
    });
    await reservationRepository.create("tenant-a", {
      guestId: "g1",
      scheduledFor: new Date(Date.now() + 90 * 60_000).toISOString(),
      partySize: 4,
      durationMinutes: 90,
      tableId: null,
      status: "confirmed",
      specialRequests: null,
      source: "web",
      confirmedAt: new Date().toISOString(),
      seatedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
    });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/optimize_floor_plan_for_shift",
      method: "POST",
      body: { shiftId: shift.id },
      tenantId: "tenant-a",
    });
    const res = await optimizeFloorPlanForShift(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      assignedCount: number;
      unassignedCount: number;
      assignments: { tableId: string; partySize: number }[];
    };
    expect(data.assignedCount).toBe(1);
    expect(data.unassignedCount).toBe(0);
    expect(data.assignments[0].tableId).toBe(t4.id);
  });

  it("returns 400 when shiftId missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/optimize_floor_plan_for_shift",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await optimizeFloorPlanForShift(request, context);
    expect(res.status).toBe(400);
  });

  it("returns 404 when shift not found", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/optimize_floor_plan_for_shift",
      method: "POST",
      body: { shiftId: "missing" },
      tenantId: "tenant-a",
    });
    const res = await optimizeFloorPlanForShift(request, context);
    expect(res.status).toBe(404);
  });

  it("flags unassignable parties when no table fits", async () => {
    const start = new Date(Date.now() + 60 * 60_000).toISOString();
    const end = new Date(Date.now() + 5 * 60 * 60_000).toISOString();
    const shift = await shiftRepository.create("tenant-a", {
      startsAt: start,
      endsAt: end,
      kind: "dinner",
      expectedCovers: 50,
    });
    await tableRepository.create("tenant-a", {
      number: "T2",
      capacity: 2,
      location: "main",
      status: "available",
    });
    await reservationRepository.create("tenant-a", {
      guestId: "g1",
      scheduledFor: new Date(Date.now() + 90 * 60_000).toISOString(),
      partySize: 8, // bigger than every available table
      durationMinutes: 90,
      tableId: null,
      status: "confirmed",
      specialRequests: null,
      source: "web",
      confirmedAt: new Date().toISOString(),
      seatedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
    });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/optimize_floor_plan_for_shift",
      method: "POST",
      body: { shiftId: shift.id },
      tenantId: "tenant-a",
    });
    const res = await optimizeFloorPlanForShift(request, context);
    const data = (await res.json()) as {
      assignedCount: number;
      unassignedCount: number;
    };
    expect(data.assignedCount).toBe(0);
    expect(data.unassignedCount).toBe(1);
  });
});
