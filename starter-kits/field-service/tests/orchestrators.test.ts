import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import optimizeRouteForDay from "../modules/mcp-tools/optimize-route-for-day.ts";
import draftEstimateFromInspection from "../modules/mcp-tools/draft-estimate-from-inspection.ts";
import flagRecurringFailuresAtSite from "../modules/mcp-tools/flag-recurring-failures-at-site.ts";
import listJobs from "../modules/handlers/list-jobs.ts";
import listTechnicians from "../modules/handlers/list-technicians.ts";
import listCustomers from "../modules/handlers/list-customers.ts";
import getJob from "../modules/handlers/get-job.ts";
import { jobRepository } from "../modules/repositories/jobs.ts";
import { technicianRepository } from "../modules/repositories/technicians.ts";
import { customerRepository } from "../modules/repositories/customers.ts";
import { inspectionRepository } from "../modules/repositories/inspections.ts";

const routes = {
  "GET /jobs": listJobs,
  "GET /jobs/:id": getJob,
  "GET /technicians": listTechnicians,
  "GET /customers": listCustomers,
};

async function clearAll() {
  for (const repo of [
    jobRepository,
    technicianRepository,
    customerRepository,
    inspectionRepository,
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
  setEnv("MAPBOX_ACCESS_TOKEN", undefined);
  setEnv("TWILIO_ACCOUNT_SID", undefined);
  setEnv("TWILIO_AUTH_TOKEN", undefined);
  setEnv("TWILIO_FROM_NUMBER", undefined);
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


describe("orchestrators/optimize_route_for_day", () => {
  it("falls back to time-order when MAPBOX_ACCESS_TOKEN is unset", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await jobRepository.create("tenant-a", {
      customerId: "c1",
      technicianEmail: "t@x.com",
      kind: "repair",
      scheduledFor: `${today}T10:00:00.000Z`,
      durationMinutes: 60,
      status: "scheduled",
      siteAddress: "A",
      description: null,
      totalCents: 0,
      paidCents: 0,
      createdAt: new Date().toISOString(),
    });
    await jobRepository.create("tenant-a", {
      customerId: "c1",
      technicianEmail: "t@x.com",
      kind: "repair",
      scheduledFor: `${today}T08:00:00.000Z`,
      durationMinutes: 60,
      status: "scheduled",
      siteAddress: "B",
      description: null,
      totalCents: 0,
      paidCents: 0,
      createdAt: new Date().toISOString(),
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/optimize_route_for_day",
      method: "POST",
      body: { technicianEmail: "t@x.com", date: today },
      tenantId: "tenant-a",
    });
    const res = await optimizeRouteForDay(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      routeStrategy: string;
      jobCount: number;
      stops: { siteAddress: string }[];
    };
    expect(data.routeStrategy).toBe("time");
    expect(data.jobCount).toBe(2);
    // Time-order: 08:00 (B) then 10:00 (A).
    expect(data.stops[0].siteAddress).toBe("B");
    expect(data.stops[1].siteAddress).toBe("A");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Mapbox geocoding + matrix when MAPBOX_ACCESS_TOKEN is set", async () => {
    setEnv("MAPBOX_ACCESS_TOKEN", "pk.test");
    const today = new Date().toISOString().slice(0, 10);
    await jobRepository.create("tenant-a", {
      customerId: "c1",
      technicianEmail: "t@x.com",
      kind: "repair",
      scheduledFor: `${today}T10:00:00.000Z`,
      durationMinutes: 60,
      status: "scheduled",
      siteAddress: "1 Main",
      description: null,
      totalCents: 0,
      paidCents: 0,
      createdAt: new Date().toISOString(),
    });
    await jobRepository.create("tenant-a", {
      customerId: "c1",
      technicianEmail: "t@x.com",
      kind: "repair",
      scheduledFor: `${today}T11:00:00.000Z`,
      durationMinutes: 60,
      status: "scheduled",
      siteAddress: "2 Pine",
      description: null,
      totalCents: 0,
      paidCents: 0,
      createdAt: new Date().toISOString(),
    });

    // 4 fetch calls: 2 geocode (one per job) + 1 matrix call.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/geocoding/")) {
          if (url.includes("Pine")) {
            return new Response(
              JSON.stringify({
                features: [{ center: [-122.5, 37.79], place_name: "2 Pine" }],
              }),
              { status: 200 },
            );
          }
          return new Response(
            JSON.stringify({
              features: [{ center: [-122.4, 37.78], place_name: "1 Main" }],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/directions-matrix/")) {
          return new Response(
            JSON.stringify({
              durations: [
                [0, 600],
                [600, 0],
              ],
              distances: [
                [0, 1000],
                [1000, 0],
              ],
            }),
            { status: 200 },
          );
        }
        return new Response("not mocked", { status: 500 });
      });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/optimize_route_for_day",
      method: "POST",
      body: { technicianEmail: "t@x.com", date: today },
      tenantId: "tenant-a",
    });
    const res = await optimizeRouteForDay(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      routeStrategy: string;
      totalDriveSeconds: number | null;
    };
    expect(data.routeStrategy).toBe("mapbox-nearest-neighbor");
    expect(data.totalDriveSeconds).toBe(600);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("does NOT send SMS when notifyTechnician is false (drafts only)", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    setEnv("TWILIO_FROM_NUMBER", "+15555550100");
    const today = new Date().toISOString().slice(0, 10);
    await jobRepository.create("tenant-a", {
      customerId: "c1",
      technicianEmail: "t@x.com",
      kind: "repair",
      scheduledFor: `${today}T10:00:00.000Z`,
      durationMinutes: 60,
      status: "scheduled",
      siteAddress: "A",
      description: null,
      totalCents: 0,
      paidCents: 0,
      createdAt: new Date().toISOString(),
    });
    await technicianRepository.create("tenant-a", {
      email: "t@x.com",
      firstName: "T",
      lastName: "X",
      skills: [],
      territory: null,
      status: "active",
      phone: "+15555550101",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/optimize_route_for_day",
      method: "POST",
      body: { technicianEmail: "t@x.com", date: today, notifyTechnician: false },
      tenantId: "tenant-a",
    });
    const res = await optimizeRouteForDay(request, context);
    const data = (await res.json()) as { smsSid: string | null };
    expect(data.smsSid).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends SMS when notifyTechnician=true and Twilio is configured", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    setEnv("TWILIO_FROM_NUMBER", "+15555550100");
    const today = new Date().toISOString().slice(0, 10);
    await jobRepository.create("tenant-a", {
      customerId: "c1",
      technicianEmail: "t@x.com",
      kind: "repair",
      scheduledFor: `${today}T10:00:00.000Z`,
      durationMinutes: 60,
      status: "scheduled",
      siteAddress: "A",
      description: null,
      totalCents: 0,
      paidCents: 0,
      createdAt: new Date().toISOString(),
    });
    await technicianRepository.create("tenant-a", {
      email: "t@x.com",
      firstName: "T",
      lastName: "X",
      skills: [],
      territory: null,
      status: "active",
      phone: "+15555550101",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sid: "SM1",
          status: "queued",
          to: "+1",
          from: "+1",
          body: "x",
        }),
        { status: 201 },
      ),
    );

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/optimize_route_for_day",
      method: "POST",
      body: { technicianEmail: "t@x.com", date: today, notifyTechnician: true },
      tenantId: "tenant-a",
    });
    const res = await optimizeRouteForDay(request, context);
    const data = (await res.json()) as { smsSid: string | null };
    expect(data.smsSid).toBe("SM1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when technicianEmail or date missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/optimize_route_for_day",
      method: "POST",
      body: { date: "2025-12-01" },
      tenantId: "tenant-a",
    });
    const res = await optimizeRouteForDay(request, context);
    expect(res.status).toBe(400);
  });

  it("isolates tenants — tenant-a's jobs invisible to tenant-b", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await jobRepository.create("tenant-a", {
      customerId: "c1",
      technicianEmail: "t@x.com",
      kind: "repair",
      scheduledFor: `${today}T10:00:00.000Z`,
      durationMinutes: 60,
      status: "scheduled",
      siteAddress: "A",
      description: null,
      totalCents: 0,
      paidCents: 0,
      createdAt: new Date().toISOString(),
    });
    const { context } = makeContext({ routes, tenantId: "tenant-b" });
    const request = makeRequest({
      url: "https://kit.test/mcp/optimize_route_for_day",
      method: "POST",
      body: { technicianEmail: "t@x.com", date: today },
      tenantId: "tenant-b",
    });
    const res = await optimizeRouteForDay(request, context);
    const data = (await res.json()) as { jobCount: number };
    expect(data.jobCount).toBe(0);
  });
});

describe("orchestrators/draft_estimate_from_inspection", () => {
  it("emits line items only for fail/warning findings", async () => {
    const customer = await customerRepository.create("tenant-a", {
      name: "Acme",
      email: "a@a.com",
      phone: "+1",
      billingAddress: null,
      sites: [],
    });
    const job = await jobRepository.create("tenant-a", {
      customerId: customer.id,
      technicianEmail: "t@x.com",
      kind: "inspection",
      scheduledFor: new Date().toISOString(),
      durationMinutes: 60,
      status: "completed",
      siteAddress: "1 Main",
      description: null,
      totalCents: 5000,
      paidCents: 0,
      createdAt: new Date().toISOString(),
    });
    const inspection = await inspectionRepository.create("tenant-a", {
      jobId: job.id,
      kind: "annual",
      performedAt: new Date().toISOString(),
      findings: [
        { item: "Compressor", status: "fail", notes: "leaking" },
        { item: "Filter", status: "pass" },
        { item: "Belt", status: "warning", notes: "frayed" },
      ],
    });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/draft_estimate_from_inspection",
      method: "POST",
      body: { inspectionId: inspection.id, perFindingCents: 30000 },
      tenantId: "tenant-a",
    });
    const res = await draftEstimateFromInspection(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      lineItems: { description: string; severity: string; suggestedCents: number }[];
      subtotalCents: number;
      suggestedTotalCents: number;
      summary: string;
    };
    expect(data.lineItems).toHaveLength(2);
    expect(data.lineItems.find((l) => l.severity === "fail")?.description).toContain(
      "Compressor",
    );
    expect(data.subtotalCents).toBe(60000);
    expect(data.suggestedTotalCents).toBe(60000);
    expect(data.summary).toContain("Acme");
    expect(data.summary).toContain("1 Main");
  });

  it("returns 400 when inspectionId missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/draft_estimate_from_inspection",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await draftEstimateFromInspection(request, context);
    expect(res.status).toBe(400);
  });

  it("returns 404 when inspection does not exist", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/draft_estimate_from_inspection",
      method: "POST",
      body: { inspectionId: "missing" },
      tenantId: "tenant-a",
    });
    const res = await draftEstimateFromInspection(request, context);
    expect(res.status).toBe(404);
  });
});

describe("orchestrators/flag_recurring_failures_at_site", () => {
  it("groups failures by item across this customer's inspections", async () => {
    const customer = await customerRepository.create("tenant-a", {
      name: "Acme",
      email: null,
      phone: null,
      billingAddress: null,
      sites: [],
    });
    const job1 = await jobRepository.create("tenant-a", {
      customerId: customer.id,
      technicianEmail: "t@x.com",
      kind: "inspection",
      scheduledFor: new Date(Date.now() - 30 * 86400000).toISOString(),
      durationMinutes: 60,
      status: "completed",
      siteAddress: "100 Pine",
      description: null,
      totalCents: 0,
      paidCents: 0,
      createdAt: new Date().toISOString(),
    });
    const job2 = await jobRepository.create("tenant-a", {
      customerId: customer.id,
      technicianEmail: "t@x.com",
      kind: "inspection",
      scheduledFor: new Date(Date.now() - 7 * 86400000).toISOString(),
      durationMinutes: 60,
      status: "completed",
      siteAddress: "100 Pine",
      description: null,
      totalCents: 0,
      paidCents: 0,
      createdAt: new Date().toISOString(),
    });
    await inspectionRepository.create("tenant-a", {
      jobId: job1.id,
      kind: "annual",
      performedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      findings: [{ item: "Compressor", status: "fail", notes: "leak 1" }],
    });
    await inspectionRepository.create("tenant-a", {
      jobId: job2.id,
      kind: "annual",
      performedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      findings: [
        { item: "Compressor", status: "fail", notes: "leak 2" },
        { item: "Filter", status: "warning" },
      ],
    });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/flag_recurring_failures_at_site",
      method: "POST",
      body: { customerId: customer.id, siteAddress: "100 Pine", minFailures: 2 },
      tenantId: "tenant-a",
    });
    const res = await flagRecurringFailuresAtSite(request, context);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      jobCount: number;
      inspectionCount: number;
      recurringItems: { item: string; failures: number }[];
    };
    expect(data.jobCount).toBe(2);
    expect(data.inspectionCount).toBe(2);
    // Compressor has 2 failures, hits the threshold; Filter has 1 warning, below.
    expect(data.recurringItems).toHaveLength(1);
    expect(data.recurringItems[0].item).toBe("Compressor");
    expect(data.recurringItems[0].failures).toBe(2);
  });

  it("returns 400 when customerId missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/mcp/flag_recurring_failures_at_site",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await flagRecurringFailuresAtSite(request, context);
    expect(res.status).toBe(400);
  });

  it("isolates tenants — tenant-a customer's data invisible to tenant-b", async () => {
    const customerA = await customerRepository.create("tenant-a", {
      name: "Acme",
      email: null,
      phone: null,
      billingAddress: null,
      sites: [],
    });
    const job = await jobRepository.create("tenant-a", {
      customerId: customerA.id,
      technicianEmail: "t@x.com",
      kind: "inspection",
      scheduledFor: new Date().toISOString(),
      durationMinutes: 60,
      status: "completed",
      siteAddress: "X",
      description: null,
      totalCents: 0,
      paidCents: 0,
      createdAt: new Date().toISOString(),
    });
    await inspectionRepository.create("tenant-a", {
      jobId: job.id,
      kind: "annual",
      performedAt: new Date().toISOString(),
      findings: [
        { item: "X", status: "fail" },
        { item: "X", status: "fail" },
      ],
    });

    const { context } = makeContext({ routes, tenantId: "tenant-b" });
    const request = makeRequest({
      url: "https://kit.test/mcp/flag_recurring_failures_at_site",
      method: "POST",
      body: { customerId: customerA.id, minFailures: 2 },
      tenantId: "tenant-b",
    });
    const res = await flagRecurringFailuresAtSite(request, context);
    const data = (await res.json()) as { jobCount: number; recurringItems: unknown[] };
    expect(data.jobCount).toBe(0);
    expect(data.recurringItems).toHaveLength(0);
  });
});
