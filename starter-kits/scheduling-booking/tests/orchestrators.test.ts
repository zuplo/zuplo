import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import bookMeeting from "../modules/handlers/book-meeting.ts";
import cancelBooking from "../modules/handlers/cancel-booking.ts";
import enforceMeetingBudget from "../modules/mcp-tools/enforce-meeting-budget.ts";
import findMutualSlot from "../modules/mcp-tools/find-mutual-slot.ts";
import rescheduleAroundConflict from "../modules/mcp-tools/reschedule-around-conflict.ts";
import listBookings from "../modules/handlers/list-bookings.ts";
import getBooking from "../modules/handlers/get-booking.ts";
import listAvailability from "../modules/handlers/list-availability.ts";
import {
  bookingRepository,
  availabilityRepository,
  type Booking,
  type Availability,
} from "../modules/repositories/bookings.ts";
import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";

const env = environment as Record<string, string | undefined>;

const routes = {
  "GET /bookings": (req: ZuploRequest, ctx: ZuploContext) => listBookings(req, ctx),
  "GET /bookings/:id": (req: ZuploRequest, ctx: ZuploContext) => getBooking(req, ctx),
  "GET /availability": (req: ZuploRequest, ctx: ZuploContext) => listAvailability(req, ctx),
};

function setEnv(key: string, value: string) {
  env[key] = value;
}
function clearEnv(...keys: string[]) {
  for (const k of keys) delete env[k];
}

function setAllCreds() {
  setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
  setEnv("ZOOM_ACCOUNT_ID", `acct-${Math.random().toString(36).slice(2)}`);
  setEnv("ZOOM_CLIENT_ID", `cid-${Math.random().toString(36).slice(2)}`);
  setEnv("ZOOM_CLIENT_SECRET", `csec-${Math.random().toString(36).slice(2)}`);
  setEnv("TWILIO_ACCOUNT_SID", "ACtest");
  setEnv("TWILIO_AUTH_TOKEN", "tok-test");
  setEnv("TWILIO_FROM_NUMBER", "+15550100");
}

function clearAllCreds() {
  clearEnv(
    "GOOGLE_CALENDAR_ACCESS_TOKEN",
    "GOOGLE_CALENDAR_ID",
    "ZOOM_ACCOUNT_ID",
    "ZOOM_CLIENT_ID",
    "ZOOM_CLIENT_SECRET",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM_NUMBER",
    "TWILIO_MESSAGING_SERVICE_SID",
  );
}

describe("orchestrator: book_meeting (3-way fan out)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    clearAllCreds();
  });

  // The Zoom S2S token is cached in a module-level variable inside zoom.ts.
  // Each test bumps the system clock past the prior cached token's expiry so
  // the OAuth exchange happens deterministically.
  function bumpClockForFreshZoomToken(daysOffset: number) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2099, 0, 1 + daysOffset));
  }

  it("happy path: provisions Zoom meeting, then Calendar event, then SMS — in that order", async () => {
    bumpClockForFreshZoomToken(0);
    setAllCreds();
    const tenantId = "tenant-book-1";

    // Sequence of fetch responses: Zoom OAuth → Zoom create → Calendar create → Twilio SMS.
    const responseQueue: Response[] = [
      new Response(
        JSON.stringify({ access_token: "zt_book", expires_in: 3600 }),
        { status: 200 },
      ),
      new Response(
        JSON.stringify({
          id: 12345,
          uuid: "u",
          topic: "Demo",
          start_time: "2026-02-01T15:00:00Z",
          duration: 30,
          timezone: "UTC",
          join_url: "https://zoom.us/j/12345",
          start_url: "https://zoom.us/s/12345",
        }),
        { status: 200 },
      ),
      new Response(
        JSON.stringify({
          id: "evt_book",
          htmlLink: "https://cal.google/x",
          status: "confirmed",
        }),
        { status: 200 },
      ),
      new Response(
        JSON.stringify({
          sid: "SMabc",
          status: "queued",
          to: "+15550100",
          from: "+15550100",
          body: "x",
          date_created: "x",
          num_segments: "1",
          price: null,
          error_code: null,
          error_message: null,
        }),
        { status: 201 },
      ),
    ];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => responseQueue.shift()!);

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/bookings",
      method: "POST",
      body: {
        eventTypeSlug: "30min-intro",
        hostEmail: "host@example.com",
        attendeeEmail: "attendee@example.com",
        attendeeName: "Alice",
        attendeePhone: "+15550199",
        scheduledFor: "2026-02-01T15:00:00Z",
        durationMinutes: 30,
        conference: "zoom",
      },
      tenantId,
    });

    const response = await bookMeeting(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      booking: Booking;
      calendarEventId: string | null;
      zoomMeetingId: string | null;
      zoomJoinUrl: string | null;
      smsSid: string | null;
      sideEffectErrors: Record<string, string>;
    };

    expect(json.zoomMeetingId).toBe("12345");
    expect(json.zoomJoinUrl).toContain("zoom.us/j/12345");
    expect(json.calendarEventId).toBe("evt_book");
    expect(json.smsSid).toBe("SMabc");
    expect(json.sideEffectErrors).toEqual({});

    // Verify call order: Zoom OAuth, Zoom meeting, Calendar, Twilio.
    expect(fetchMock.mock.calls).toHaveLength(4);
    expect(String(fetchMock.mock.calls[0][0])).toContain("zoom.us/oauth/token");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/users/me/meetings");
    expect(String(fetchMock.mock.calls[2][0])).toContain("calendar/v3");
    expect(String(fetchMock.mock.calls[3][0])).toContain("api.twilio.com");

    // Booking is persisted with the side-effect ids.
    const stored = await bookingRepository.get(tenantId, json.booking.id);
    expect(stored?.calendarEventId).toBe("evt_book");
    expect(stored?.zoomMeetingId).toBe("12345");
    expect(stored?.zoomJoinUrl).toContain("zoom.us/j/12345");
  });

  it("when Zoom fails, calendar event is still created (documented behavior)", async () => {
    bumpClockForFreshZoomToken(30);
    setAllCreds();
    const tenantId = "tenant-book-zoom-fail";

    // Zoom OAuth succeeds, Zoom create returns 500. Then Calendar succeeds.
    // SMS — none, no phone provided.
    const responseQueue: Response[] = [
      new Response(JSON.stringify({ access_token: "zt", expires_in: 3600 }), { status: 200 }),
      new Response("upstream zoom 500", { status: 500 }),
      new Response(
        JSON.stringify({
          id: "evt_after_zoom_fail",
          htmlLink: "https://cal.google/x",
        }),
        { status: 200 },
      ),
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => responseQueue.shift()!);

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/bookings",
      method: "POST",
      body: {
        eventTypeSlug: "30min-intro",
        hostEmail: "host@example.com",
        attendeeEmail: "attendee@example.com",
        attendeeName: "Alice",
        scheduledFor: "2026-02-01T15:00:00Z",
        durationMinutes: 30,
        conference: "zoom",
      },
      tenantId,
    });

    const response = await bookMeeting(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      calendarEventId: string | null;
      zoomMeetingId: string | null;
      sideEffectErrors: Record<string, string>;
    };

    // Document the actual behavior: zoom error captured, calendar event still created.
    expect(json.zoomMeetingId).toBeNull();
    expect(json.sideEffectErrors.zoom).toMatch(/Zoom create meeting failed/);
    expect(json.calendarEventId).toBe("evt_after_zoom_fail");
    expect(json.sideEffectErrors.calendar).toBeUndefined();
  });

  it("when Calendar fails, Zoom meeting still exists and SMS still goes out", async () => {
    bumpClockForFreshZoomToken(60);
    setAllCreds();
    const tenantId = "tenant-book-cal-fail";

    const responseQueue: Response[] = [
      new Response(JSON.stringify({ access_token: "zt2", expires_in: 3600 }), { status: 200 }),
      new Response(
        JSON.stringify({
          id: 99,
          uuid: "u",
          topic: "x",
          start_time: "2026-02-01T15:00:00Z",
          duration: 30,
          timezone: "UTC",
          join_url: "https://zoom.us/j/99",
          start_url: "https://zoom.us/s/99",
        }),
        { status: 200 },
      ),
      new Response("calendar 503", { status: 503 }),
      new Response(
        JSON.stringify({
          sid: "SMcal_fail",
          status: "queued",
          to: "+15550199",
          from: "+15550100",
          body: "x",
          date_created: "x",
          num_segments: "1",
          price: null,
          error_code: null,
          error_message: null,
        }),
        { status: 201 },
      ),
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => responseQueue.shift()!);

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/bookings",
      method: "POST",
      body: {
        eventTypeSlug: "30min",
        hostEmail: "host@example.com",
        attendeeEmail: "attendee@example.com",
        attendeeName: "Alice",
        attendeePhone: "+15550199",
        scheduledFor: "2026-02-01T15:00:00Z",
        durationMinutes: 30,
        conference: "zoom",
      },
      tenantId,
    });

    const response = await bookMeeting(request, context);
    const json = (await response.json()) as {
      zoomMeetingId: string | null;
      calendarEventId: string | null;
      smsSid: string | null;
      sideEffectErrors: Record<string, string>;
    };

    expect(json.zoomMeetingId).toBe("99");
    expect(json.calendarEventId).toBeNull();
    expect(json.sideEffectErrors.calendar).toMatch(/Google Calendar create event failed/);
    // SMS still attempts and succeeds.
    expect(json.smsSid).toBe("SMcal_fail");
  });

  it("silent=true skips all side effects; booking is still persisted", async () => {
    const tenantId = "tenant-book-silent";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/bookings",
      method: "POST",
      body: {
        eventTypeSlug: "30min",
        hostEmail: "host@example.com",
        attendeeEmail: "attendee@example.com",
        attendeeName: "Alice",
        attendeePhone: "+15550199",
        scheduledFor: "2026-02-01T15:00:00Z",
        durationMinutes: 30,
        conference: "zoom",
        silent: true,
      },
      tenantId,
    });

    const response = await bookMeeting(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      booking: Booking;
      zoomMeetingId: string | null;
      calendarEventId: string | null;
      smsSid: string | null;
    };
    expect(fetchMock).not.toHaveBeenCalled();
    expect(json.zoomMeetingId).toBeNull();
    expect(json.calendarEventId).toBeNull();
    expect(json.smsSid).toBeNull();
    expect(json.booking.eventTypeSlug).toBe("30min");
  });

  it("conference=none skips Zoom and creates only the calendar event", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    const tenantId = "tenant-book-no-zoom";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: "evt_no_zoom", htmlLink: "https://cal" }),
        { status: 200 },
      ),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/bookings",
      method: "POST",
      body: {
        eventTypeSlug: "30min",
        hostEmail: "host@example.com",
        attendeeEmail: "attendee@example.com",
        attendeeName: "Alice",
        scheduledFor: "2026-02-01T15:00:00Z",
        durationMinutes: 30,
        conference: "none",
      },
      tenantId,
    });

    const response = await bookMeeting(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      zoomMeetingId: string | null;
      calendarEventId: string | null;
    };
    expect(json.zoomMeetingId).toBeNull();
    expect(json.calendarEventId).toBe("evt_no_zoom");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("orchestrator: cancel_booking", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    clearAllCreds();
  });

  function bumpClockForFreshZoomToken(daysOffset: number) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2101, 0, 1 + daysOffset));
  }

  async function seedBooking(tenantId: string, overrides: Partial<Booking> = {}) {
    return bookingRepository.create(tenantId, {
      eventTypeSlug: "30min",
      hostEmail: "host@example.com",
      attendeeEmail: "attendee@example.com",
      attendeeName: "Alice",
      attendeePhone: "+15550199",
      scheduledFor: "2026-02-01T15:00:00Z",
      durationMinutes: 30,
      status: "confirmed",
      canceledAt: null,
      cancelReason: null,
      notes: null,
      location: null,
      calendarEventId: "evt_to_cancel",
      zoomMeetingId: "zoom_to_cancel",
      zoomJoinUrl: "https://zoom.us/j/zoom_to_cancel",
      createdAt: new Date().toISOString(),
      ...overrides,
    });
  }

  it("happy path: deletes Calendar event, Zoom meeting, and texts attendee", async () => {
    bumpClockForFreshZoomToken(0);
    setAllCreds();
    const tenantId = "tenant-cancel-1";
    const seeded = await seedBooking(tenantId);

    const responseQueue: Response[] = [
      new Response(null, { status: 204 }), // Calendar delete
      new Response(JSON.stringify({ access_token: "zt_c", expires_in: 3600 }), { status: 200 }),
      new Response(null, { status: 204 }), // Zoom delete
      new Response(
        JSON.stringify({
          sid: "SMcancel",
          status: "queued",
          to: "+15550199",
          from: "+15550100",
          body: "x",
          date_created: "x",
          num_segments: "1",
          price: null,
          error_code: null,
          error_message: null,
        }),
        { status: 201 },
      ),
    ];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => responseQueue.shift()!);

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: `https://kit.test/bookings/${seeded.id}`,
      method: "POST",
      body: { reason: "rescheduled by attendee" },
      tenantId,
      params: { id: seeded.id },
    });

    const response = await cancelBooking(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      booking: Booking;
      sideEffectErrors: Record<string, string>;
    };
    expect(json.booking.status).toBe("canceled");
    expect(json.booking.cancelReason).toBe("rescheduled by attendee");
    expect(json.sideEffectErrors).toEqual({});

    // 4 fetches: Calendar DELETE, Zoom OAuth, Zoom DELETE, Twilio SMS.
    expect(fetchMock.mock.calls).toHaveLength(4);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "calendar/v3/calendars/primary/events/evt_to_cancel",
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
    expect(String(fetchMock.mock.calls[1][0])).toContain("zoom.us/oauth/token");
    expect(String(fetchMock.mock.calls[2][0])).toContain("meetings/zoom_to_cancel");
    expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe("DELETE");
    expect(String(fetchMock.mock.calls[3][0])).toContain("api.twilio.com");
  });

  it("returns 404 for an unknown booking id", async () => {
    const tenantId = "tenant-cancel-404";
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/bookings/missing",
      method: "POST",
      body: { reason: "x" },
      tenantId,
      params: { id: "missing" },
    });

    const response = await cancelBooking(request, context);
    expect(response.status).toBe(404);
  });

  it("silent=true skips Calendar/Zoom/SMS but still cancels in DB", async () => {
    const tenantId = "tenant-cancel-silent";
    const seeded = await seedBooking(tenantId);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: `https://kit.test/bookings/${seeded.id}`,
      method: "POST",
      body: { silent: true },
      tenantId,
      params: { id: seeded.id },
    });

    const response = await cancelBooking(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { booking: Booking };
    expect(json.booking.status).toBe("canceled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not see another tenant's booking", async () => {
    const tenantA = "tenant-cancel-iso-a";
    const tenantB = "tenant-cancel-iso-b";
    const seeded = await seedBooking(tenantB);

    const { context } = makeContext({ routes, tenantId: tenantA });
    const request = makeRequest({
      url: `https://kit.test/bookings/${seeded.id}`,
      method: "POST",
      body: {},
      tenantId: tenantA,
      params: { id: seeded.id },
    });

    const response = await cancelBooking(request, context);
    expect(response.status).toBe(404);
  });
});

describe("orchestrator: enforce_meeting_budget", () => {
  afterEach(() => vi.restoreAllMocks());

  async function seedBooking(tenantId: string, overrides: Partial<Booking>) {
    return bookingRepository.create(tenantId, {
      eventTypeSlug: "30min",
      hostEmail: "host@example.com",
      attendeeEmail: "a@x.com",
      attendeeName: "x",
      attendeePhone: null,
      scheduledFor: "2026-02-02T10:00:00Z",
      durationMinutes: 30,
      status: "confirmed",
      canceledAt: null,
      cancelReason: null,
      notes: null,
      location: null,
      calendarEventId: null,
      zoomMeetingId: null,
      zoomJoinUrl: null,
      createdAt: new Date().toISOString(),
      ...overrides,
    });
  }

  it("flags overBudget when sum of durations exceeds maxHours", async () => {
    const tenantId = "tenant-budget-1";
    // 3 confirmed bookings × 60 min = 3h.
    for (let i = 0; i < 3; i++) {
      await seedBooking(tenantId, {
        scheduledFor: `2026-02-0${2 + i}T10:00:00Z`,
        durationMinutes: 60,
        hostEmail: "owner@x.com",
      });
    }

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/enforce-meeting-budget",
      method: "POST",
      body: {
        ownerEmail: "owner@x.com",
        weekStartDate: "2026-02-02T00:00:00Z",
        maxHours: 2,
      },
      tenantId,
    });

    const response = await enforceMeetingBudget(request, context);
    const json = (await response.json()) as {
      bookedHours: number;
      overBudget: boolean;
      overByHours: number;
    };
    expect(json.bookedHours).toBe(3);
    expect(json.overBudget).toBe(true);
    expect(json.overByHours).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 0 hours when owner has no bookings in window", async () => {
    const tenantId = "tenant-budget-empty";
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/enforce-meeting-budget",
      method: "POST",
      body: {
        ownerEmail: "ghost@x.com",
        weekStartDate: "2026-02-02T00:00:00Z",
        maxHours: 5,
      },
      tenantId,
    });

    const response = await enforceMeetingBudget(request, context);
    const json = (await response.json()) as {
      bookedHours: number;
      overBudget: boolean;
    };
    expect(json.bookedHours).toBe(0);
    expect(json.overBudget).toBe(false);
  });
});

describe("orchestrator: find_mutual_slot", () => {
  afterEach(() => vi.restoreAllMocks());

  it("finds open slots when both hosts are available and unbooked", async () => {
    const tenantId = "tenant-mutual-1";
    // Both hosts available Mon-Fri 09:00-12:00. Day-of-week: 2026-02-02 is a Monday (1).
    for (const ownerEmail of ["a@x.com", "b@x.com"]) {
      for (let dow = 1; dow <= 5; dow++) {
        await availabilityRepository.create(tenantId, {
          ownerEmail,
          dayOfWeek: dow,
          startTime: "09:00",
          endTime: "12:00",
          timezone: "UTC",
          createdAt: new Date().toISOString(),
        } as Omit<Availability, "id" | "tenantId">);
      }
    }

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/find-mutual-slot",
      method: "POST",
      body: {
        hostEmails: ["a@x.com", "b@x.com"],
        durationMinutes: 30,
        dateFrom: "2026-02-02",
        dateTo: "2026-02-03",
      },
      tenantId,
    });

    const response = await findMutualSlot(request, context);
    const json = (await response.json()) as { slots: Array<{ start: string; end: string }> };
    expect(json.slots.length).toBeGreaterThan(0);
    expect(json.slots.length).toBeLessThanOrEqual(5);
  });

  it("returns no slots when one host has no availability", async () => {
    const tenantId = "tenant-mutual-empty";
    await availabilityRepository.create(tenantId, {
      ownerEmail: "only@x.com",
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "12:00",
      timezone: "UTC",
      createdAt: new Date().toISOString(),
    } as Omit<Availability, "id" | "tenantId">);

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/find-mutual-slot",
      method: "POST",
      body: {
        hostEmails: ["only@x.com", "missing@x.com"],
        durationMinutes: 30,
        dateFrom: "2026-02-02",
        dateTo: "2026-02-03",
      },
      tenantId,
    });

    const response = await findMutualSlot(request, context);
    const json = (await response.json()) as { slots: unknown[] };
    expect(json.slots).toEqual([]);
  });
});

describe("orchestrator: reschedule_around_conflict", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null proposal when no availability windows configured", async () => {
    const tenantId = "tenant-reschedule-1";
    const seeded = await bookingRepository.create(tenantId, {
      eventTypeSlug: "30min",
      hostEmail: "host@x.com",
      attendeeEmail: "a@x.com",
      attendeeName: "x",
      attendeePhone: null,
      scheduledFor: "2026-02-02T10:00:00Z",
      durationMinutes: 30,
      status: "confirmed",
      canceledAt: null,
      cancelReason: null,
      notes: null,
      location: null,
      calendarEventId: null,
      zoomMeetingId: null,
      zoomJoinUrl: null,
      createdAt: new Date().toISOString(),
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/reschedule-around-conflict",
      method: "POST",
      body: { bookingId: seeded.id, searchDays: 7 },
      tenantId,
    });

    const response = await rescheduleAroundConflict(request, context);
    const json = (await response.json()) as {
      proposedScheduledFor: string | null;
      note: string;
    };
    expect(json.proposedScheduledFor).toBeNull();
  });
});
