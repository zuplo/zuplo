import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import draftOfferSummary from "../modules/mcp-tools/draft-offer-summary.ts";
import matchLeadToListings from "../modules/mcp-tools/match-lead-to-listings.ts";
import scheduleShowingRound from "../modules/mcp-tools/schedule-showing-round.ts";
import scheduleShowing from "../modules/handlers/schedule-showing.ts";
import createLead from "../modules/handlers/create-lead.ts";
import getListing from "../modules/handlers/get-listing.ts";
import listListings from "../modules/handlers/list-listings.ts";
import listOffers from "../modules/handlers/list-offers.ts";
import listLeads from "../modules/handlers/list-leads.ts";
import {
  listingRepository,
  leadRepository,
  offerRepository,
  showingRepository,
  type Listing,
  type Lead,
  type Offer,
} from "../modules/repositories/listings.ts";
import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";

const env = environment as Record<string, string | undefined>;

function setEnv(key: string, value: string) {
  env[key] = value;
}
function clearEnv(...keys: string[]) {
  for (const k of keys) delete env[k];
}

// Inline a get-lead handler since the kit's routes.oas.json doesn't expose one
// but the match_lead_to_listings orchestrator dispatches `GET /leads/{id}`.
const leadGetHandler = async (req: ZuploRequest, _ctx: ZuploContext) => {
  const tenantId = (req.user?.data as { tenantId?: string } | undefined)?.tenantId;
  if (!tenantId) return new Response("no tenant", { status: 401 });
  const id = req.params?.id;
  if (!id) return new Response("no id", { status: 400 });
  const lead = await leadRepository.get(tenantId, id);
  if (!lead) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Lead not found" } }),
      { status: 404 },
    );
  }
  return new Response(JSON.stringify(lead), {
    headers: { "content-type": "application/json" },
  });
};

const orchRoutes = {
  "GET /listings": (req: ZuploRequest, ctx: ZuploContext) => listListings(req, ctx),
  "GET /listings/:id": (req: ZuploRequest, ctx: ZuploContext) => getListing(req, ctx),
  "GET /offers": (req: ZuploRequest, ctx: ZuploContext) => listOffers(req, ctx),
  "GET /leads": (req: ZuploRequest, ctx: ZuploContext) => listLeads(req, ctx),
  "GET /leads/:id": leadGetHandler,
};

async function seedListing(
  tenantId: string,
  overrides: Partial<Listing> = {},
): Promise<Listing> {
  return listingRepository.create(tenantId, {
    mlsNumber: "MLS-1",
    address: "123 Main",
    city: "Austin",
    state: "TX",
    zip: "78701",
    listPriceCents: 500_000_00,
    status: "active",
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1800,
    lotSizeSqft: 5000,
    propertyType: "single_family",
    listingAgentEmail: "agent@example.com",
    listedAt: "2026-01-01T00:00:00Z",
    soldAt: null,
    soldPriceCents: null,
    description: "",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Omit<Listing, "id" | "tenantId">);
}

async function seedLead(tenantId: string, overrides: Partial<Lead> = {}): Promise<Lead> {
  return leadRepository.create(tenantId, {
    firstName: "Alice",
    lastName: "Lead",
    email: "alice.lead@example.com",
    phone: "+15550199",
    source: "manual",
    status: "new",
    agentEmail: "agent@example.com",
    budgetCents: 600_000_00,
    areaInterest: "Austin",
    bedroomsMin: 3,
    addedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Omit<Lead, "id" | "tenantId">);
}

describe("orchestrator: draft_offer_summary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns chronological summary with delta vs list", async () => {
    const tenantId = "tenant-offer-summary-1";
    const listing = await seedListing(tenantId, { listPriceCents: 500_00 * 1000 });

    await offerRepository.create(tenantId, {
      listingId: listing.id,
      leadId: "L1",
      amountCents: 480_00 * 1000,
      contingencies: ["financing"],
      status: "submitted",
      submittedAt: "2026-01-15T00:00:00Z",
      createdAt: "2026-01-15T00:00:00Z",
    } as Omit<Offer, "id" | "tenantId">);

    await offerRepository.create(tenantId, {
      listingId: listing.id,
      leadId: "L2",
      amountCents: 510_00 * 1000,
      contingencies: [],
      status: "accepted",
      submittedAt: "2026-01-20T00:00:00Z",
      createdAt: "2026-01-20T00:00:00Z",
    } as Omit<Offer, "id" | "tenantId">);

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes: orchRoutes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/draft-offer-summary",
      method: "POST",
      body: { listingId: listing.id },
      tenantId,
    });

    const response = await draftOfferSummary(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      offerCount: number;
      acceptedOfferId: string | null;
      summary: string;
    };
    expect(json.offerCount).toBe(2);
    expect(json.acceptedOfferId).not.toBeNull();
    expect(json.summary).toContain("123 Main");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 0 offers gracefully when listing has none", async () => {
    const tenantId = "tenant-offer-empty";
    const listing = await seedListing(tenantId);

    const { context } = makeContext({ routes: orchRoutes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/draft-offer-summary",
      method: "POST",
      body: { listingId: listing.id },
      tenantId,
    });

    const response = await draftOfferSummary(request, context);
    const json = (await response.json()) as {
      offerCount: number;
      summary: string;
    };
    expect(json.offerCount).toBe(0);
    expect(json.summary).toContain("No offers received");
  });

  it("returns 400 when listingId is missing", async () => {
    const { context } = makeContext({ routes: orchRoutes, tenantId: "t-os-bad" });
    const request = makeRequest({
      url: "https://kit.test/draft-offer-summary",
      method: "POST",
      body: {},
      tenantId: "t-os-bad",
    });
    const response = await draftOfferSummary(request, context);
    expect(response.status).toBe(400);
  });
});

describe("orchestrator: match_lead_to_listings", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns active listings within budget and area", async () => {
    const tenantId = "tenant-match-1";
    const lead = await seedLead(tenantId, {
      budgetCents: 600_000_00,
      areaInterest: "Austin",
      bedroomsMin: 3,
    });
    await seedListing(tenantId, {
      city: "Austin",
      bedrooms: 3,
      listPriceCents: 550_000_00,
      status: "active",
    });
    // Out of budget
    await seedListing(tenantId, {
      city: "Austin",
      bedrooms: 3,
      listPriceCents: 700_000_00,
      status: "active",
    });
    // Wrong city
    await seedListing(tenantId, {
      city: "Dallas",
      bedrooms: 3,
      listPriceCents: 500_000_00,
      status: "active",
    });

    const { context } = makeContext({ routes: orchRoutes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/match-lead-to-listings",
      method: "POST",
      body: { leadId: lead.id },
      tenantId,
    });

    const response = await matchLeadToListings(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      matchCount: number;
      matches: Array<{ city: string; listPriceCents: number }>;
    };
    expect(json.matchCount).toBe(1);
    expect(json.matches[0].city).toBe("Austin");
    expect(json.matches[0].listPriceCents).toBe(550_000_00);
  });

  it("returns 400 when leadId is missing", async () => {
    const { context } = makeContext({ routes: orchRoutes, tenantId: "t-mt-bad" });
    const request = makeRequest({
      url: "https://kit.test/match-lead-to-listings",
      method: "POST",
      body: {},
      tenantId: "t-mt-bad",
    });
    const response = await matchLeadToListings(request, context);
    expect(response.status).toBe(400);
  });

  it("does not match listings from another tenant", async () => {
    const tenantA = "tenant-match-iso-a";
    const tenantB = "tenant-match-iso-b";
    const lead = await seedLead(tenantA);
    // Tenant B has a perfect match.
    await seedListing(tenantB, {
      city: "Austin",
      bedrooms: 3,
      listPriceCents: 550_000_00,
      status: "active",
    });

    const { context } = makeContext({ routes: orchRoutes, tenantId: tenantA });
    const request = makeRequest({
      url: "https://kit.test/match-lead-to-listings",
      method: "POST",
      body: { leadId: lead.id },
      tenantId: tenantA,
    });

    const response = await matchLeadToListings(request, context);
    const json = (await response.json()) as { matchCount: number };
    expect(json.matchCount).toBe(0);
  });
});

describe("orchestrator: schedule_showing_round", () => {
  afterEach(() => vi.restoreAllMocks());

  it("packs proposals at duration+buffer intervals", async () => {
    const tenantId = "tenant-round-1";
    const l1 = await seedListing(tenantId, { address: "111 A St" });
    const l2 = await seedListing(tenantId, { address: "222 B St" });

    const { context } = makeContext({ routes: orchRoutes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/schedule-showing-round",
      method: "POST",
      body: {
        leadId: "lead-1",
        listingIds: [l1.id, l2.id],
        dateRange: { start: "2026-03-01T15:00:00Z", end: "2026-03-01T18:00:00Z" },
        durationMinutes: 30,
        bufferMinutes: 15,
      },
      tenantId,
    });

    const response = await scheduleShowingRound(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      proposals: Array<{ proposedStart: string; proposedEnd: string }>;
    };
    expect(json.proposals).toHaveLength(2);
    // Second proposal should start 45 minutes after the first.
    const firstEnd = new Date(json.proposals[0].proposedEnd).getTime();
    const secondStart = new Date(json.proposals[1].proposedStart).getTime();
    expect(secondStart - firstEnd).toBe(15 * 60 * 1000);
  });

  it("returns 400 when listingIds is empty", async () => {
    const { context } = makeContext({ routes: orchRoutes, tenantId: "t-ssr-bad" });
    const request = makeRequest({
      url: "https://kit.test/schedule-showing-round",
      method: "POST",
      body: {
        leadId: "x",
        listingIds: [],
        dateRange: { start: "2026-03-01", end: "2026-03-02" },
      },
      tenantId: "t-ssr-bad",
    });
    const response = await scheduleShowingRound(request, context);
    expect(response.status).toBe(400);
  });
});

describe("orchestrator-ish: schedule_showing (uses GCal + Twilio)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv(
      "GOOGLE_CALENDAR_ACCESS_TOKEN",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_FROM_NUMBER",
    );
  });

  it("happy path: creates calendar event and texts the lead", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    setEnv("TWILIO_FROM_NUMBER", "+15550100");
    const tenantId = "tenant-show-1";
    const listing = await seedListing(tenantId);
    const lead = await seedLead(tenantId, { phone: "+15550199" });

    const responseQueue: Response[] = [
      new Response(JSON.stringify({ id: "evt_show", htmlLink: "https://x" }), { status: 200 }),
      new Response(
        JSON.stringify({
          sid: "SM_show",
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

    const { context } = makeContext({ routes: orchRoutes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/showings",
      method: "POST",
      body: {
        listingId: listing.id,
        leadId: lead.id,
        scheduledFor: "2026-03-01T15:00:00Z",
        durationMinutes: 30,
        agentEmail: "agent@example.com",
      },
      tenantId,
    });

    const response = await scheduleShowing(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      calendarEventId: string | null;
      smsSid: string | null;
      sideEffectErrors: Record<string, string>;
    };
    expect(json.calendarEventId).toBe("evt_show");
    expect(json.smsSid).toBe("SM_show");
    expect(json.sideEffectErrors).toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("silent=true skips Calendar + SMS but persists the showing", async () => {
    const tenantId = "tenant-show-silent";
    const listing = await seedListing(tenantId);
    const lead = await seedLead(tenantId);

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes: orchRoutes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/showings",
      method: "POST",
      body: {
        listingId: listing.id,
        leadId: lead.id,
        scheduledFor: "2026-03-01T15:00:00Z",
        agentEmail: "agent@example.com",
        silent: true,
      },
      tenantId,
    });

    const response = await scheduleShowing(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      calendarEventId: string | null;
      smsSid: string | null;
      showing: { id: string };
    };
    expect(json.calendarEventId).toBeNull();
    expect(json.smsSid).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    const stored = await showingRepository.get(tenantId, json.showing.id);
    expect(stored).not.toBeNull();
  });

  it("captures SMS error but does not roll back showing creation", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    setEnv("TWILIO_FROM_NUMBER", "+15550100");
    const tenantId = "tenant-show-sms-fail";
    const listing = await seedListing(tenantId);
    const lead = await seedLead(tenantId, { phone: "+15550199" });

    const responseQueue: Response[] = [
      new Response(JSON.stringify({ id: "evt", htmlLink: "" }), { status: 200 }),
      new Response("twilio failed", { status: 500 }),
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => responseQueue.shift()!);

    const { context } = makeContext({ routes: orchRoutes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/showings",
      method: "POST",
      body: {
        listingId: listing.id,
        leadId: lead.id,
        scheduledFor: "2026-03-01T15:00:00Z",
        agentEmail: "agent@example.com",
      },
      tenantId,
    });

    const response = await scheduleShowing(request, context);
    const json = (await response.json()) as {
      calendarEventId: string | null;
      smsSid: string | null;
      sideEffectErrors: Record<string, string>;
    };
    expect(json.calendarEventId).toBe("evt");
    expect(json.smsSid).toBeNull();
    expect(json.sideEffectErrors.sms).toMatch(/500/);
  });
});

describe("orchestrator-ish: create_lead (uses Resend twice)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RESEND_API_KEY", "RESEND_FROM_EMAIL");
  });

  it("sends a confirmation email to the lead and a notification email to the agent", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    const tenantId = "tenant-cl-1";

    // mockImplementation gives us a fresh Response per call (single-use bodies).
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(JSON.stringify({ id: "re_msg" }), { status: 200 }),
      );

    const { context } = makeContext({ routes: orchRoutes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/leads",
      method: "POST",
      body: {
        firstName: "Bob",
        lastName: "Buyer",
        email: "bob@example.com",
        agentEmail: "agent@example.com",
        areaInterest: "Austin",
      },
      tenantId,
    });

    const response = await createLead(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      confirmationEmailId: string | null;
      agentEmailId: string | null;
    };
    expect(json.confirmationEmailId).not.toBeNull();
    expect(json.agentEmailId).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("silent=true skips both emails", async () => {
    const tenantId = "tenant-cl-silent";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const { context } = makeContext({ routes: orchRoutes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/leads",
      method: "POST",
      body: {
        firstName: "Bob",
        lastName: "Buyer",
        email: "bob@example.com",
        agentEmail: "agent@example.com",
        silent: true,
      },
      tenantId,
    });

    const response = await createLead(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      confirmationEmailId: string | null;
      agentEmailId: string | null;
    };
    expect(json.confirmationEmailId).toBeNull();
    expect(json.agentEmailId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
