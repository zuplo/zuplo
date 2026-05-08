import { afterEach, describe, expect, it, vi } from "vitest";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import {
  changeRepository,
  incidentRepository,
  incidentUpdateRepository,
  onCallRepository,
} from "../modules/repositories/incidents.ts";
import assessChangeRiskHandler from "../modules/mcp-tools/assess-change-risk.ts";
import currentOnCallForServiceHandler from "../modules/mcp-tools/current-oncall-for-service.ts";
import summarizeTimelineHandler from "../modules/mcp-tools/summarize-timeline.ts";
import getIncidentHandler from "../modules/handlers/get-incident.ts";
import listOncallScheduleHandler from "../modules/handlers/list-oncall-schedule.ts";

afterEach(async () => {
  vi.restoreAllMocks();
  for (const tenant of ["tenant-a", "tenant-b"]) {
    for (const repo of [
      changeRepository,
      incidentRepository,
      incidentUpdateRepository,
      onCallRepository,
    ]) {
      const page = await repo.list(tenant, { limit: 1000 });
      for (const item of page.items) {
        await repo.delete(tenant, item.id).catch(() => {});
      }
    }
  }
});

describe("orchestrator assess_change_risk", () => {
  it("scores risk based on kind + services + recent failures", async () => {
    const tenant = "tenant-a";
    const recentlyDeclared = new Date(Date.now() - 1 * 86400000).toISOString();

    const change = await changeRepository.create(tenant, {
      title: "Schema migration",
      description: "Add column",
      kind: "normal",
      riskLevel: "med",
      scheduledFor: "2026-06-01T00:00:00.000Z",
      status: "submitted",
      changeOwner: "owner@example.com",
      approverEmail: null,
      affectedServices: ["api", "web"],
      completedAt: null,
    });
    // Two recent overlapping incidents (each adds 3 points).
    await incidentRepository.create(tenant, {
      title: "Outage 1",
      description: "x",
      severity: "sev2",
      status: "resolved",
      commanderEmail: "ic@example.com",
      declaredAt: recentlyDeclared,
      resolvedAt: recentlyDeclared,
      affectedServices: ["api"],
      rootCause: null,
    });
    await incidentRepository.create(tenant, {
      title: "Outage 2",
      description: "x",
      severity: "sev2",
      status: "resolved",
      commanderEmail: "ic@example.com",
      declaredAt: recentlyDeclared,
      resolvedAt: recentlyDeclared,
      affectedServices: ["web"],
      rootCause: null,
    });

    const { context } = makeContext({ routes: {}, tenantId: tenant });
    const request = makeRequest({
      url: "https://kit.test/assess-change-risk",
      method: "POST",
      body: { changeId: change.id },
      tenantId: tenant,
    });

    const response = await assessChangeRiskHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      score: number;
      bucket: string;
      factors: Array<{ name: string; weight: number }>;
      overlappingIncidents: unknown[];
    };
    // kind=30, services=10 (2*5), recentFailures=6 (2*3) => 46 => med
    expect(data.score).toBe(46);
    expect(data.bucket).toBe("med");
    expect((data.overlappingIncidents as unknown[]).length).toBe(2);
  });

  it("returns 404 for unknown changeId", async () => {
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/assess-change-risk",
      method: "POST",
      body: { changeId: "nope" },
      tenantId: "tenant-a",
    });
    const response = await assessChangeRiskHandler(request, context);
    expect(response.status).toBe(404);
  });

  it("returns 400 without changeId", async () => {
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/assess-change-risk",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const response = await assessChangeRiskHandler(request, context);
    expect(response.status).toBe(400);
  });

  it("respects multi-tenant isolation — incidents from other tenants do not raise score", async () => {
    const tenant = "tenant-a";
    const recent = new Date(Date.now() - 1 * 86400000).toISOString();
    const change = await changeRepository.create(tenant, {
      title: "X",
      description: "x",
      kind: "standard",
      riskLevel: "low",
      scheduledFor: "2026-06-01T00:00:00.000Z",
      status: "submitted",
      changeOwner: "o@example.com",
      approverEmail: null,
      affectedServices: ["api"],
      completedAt: null,
    });
    // Tenant B has overlapping incidents.
    await incidentRepository.create("tenant-b", {
      title: "Other tenant outage",
      description: "x",
      severity: "sev2",
      status: "resolved",
      commanderEmail: "x",
      declaredAt: recent,
      resolvedAt: recent,
      affectedServices: ["api"],
      rootCause: null,
    });
    const { context } = makeContext({ routes: {}, tenantId: tenant });
    const request = makeRequest({
      url: "https://kit.test/assess-change-risk",
      method: "POST",
      body: { changeId: change.id },
      tenantId: tenant,
    });
    const response = await assessChangeRiskHandler(request, context);
    const data = (await response.json()) as {
      overlappingIncidents: unknown[];
    };
    expect((data.overlappingIncidents as unknown[]).length).toBe(0);
  });
});

describe("orchestrator current_oncall_for_service", () => {
  it("returns the active rotation entry covering `at`", async () => {
    const tenant = "tenant-a";
    const now = Date.now();
    await onCallRepository.create(tenant, {
      rotationName: "api",
      employeeEmail: "alice@example.com",
      startsAt: new Date(now - 60_000).toISOString(),
      endsAt: new Date(now + 60_000).toISOString(),
    });
    await onCallRepository.create(tenant, {
      rotationName: "api",
      employeeEmail: "bob@example.com",
      startsAt: new Date(now + 60_000 * 60).toISOString(),
      endsAt: new Date(now + 60_000 * 120).toISOString(),
    });

    const { context } = makeContext({
      routes: { "GET /oncall-schedule": listOncallScheduleHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/current-oncall-for-service",
      method: "POST",
      body: { serviceSlug: "api" },
      tenantId: tenant,
    });
    const response = await currentOnCallForServiceHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      active: Array<{ employeeEmail: string }>;
      upcoming: { employeeEmail: string } | null;
    };
    expect(data.active.length).toBe(1);
    expect(data.active[0].employeeEmail).toBe("alice@example.com");
    expect(data.upcoming?.employeeEmail).toBe("bob@example.com");
  });

  it("returns no active when nothing on call", async () => {
    const tenant = "tenant-a";
    const { context } = makeContext({
      routes: { "GET /oncall-schedule": listOncallScheduleHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/current-oncall-for-service",
      method: "POST",
      body: { serviceSlug: "missing" },
      tenantId: tenant,
    });
    const response = await currentOnCallForServiceHandler(request, context);
    const data = (await response.json()) as {
      active: unknown[];
      upcoming: unknown;
    };
    expect(data.active.length).toBe(0);
    expect(data.upcoming).toBeNull();
  });

  it("returns 400 without serviceSlug", async () => {
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/current-oncall-for-service",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const response = await currentOnCallForServiceHandler(request, context);
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid `at`", async () => {
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/current-oncall-for-service",
      method: "POST",
      body: { serviceSlug: "api", at: "not-a-date" },
      tenantId: "tenant-a",
    });
    const response = await currentOnCallForServiceHandler(request, context);
    expect(response.status).toBe(400);
  });
});

describe("orchestrator summarize_timeline", () => {
  it("returns chronological timeline of updates + transitions", async () => {
    const tenant = "tenant-a";
    const incident = await incidentRepository.create(tenant, {
      title: "Outage",
      description: "x",
      severity: "sev2",
      status: "resolved",
      commanderEmail: "ic@example.com",
      declaredAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: "2026-05-01T01:00:00.000Z",
      affectedServices: ["api"],
      rootCause: "deploy",
    });
    await incidentUpdateRepository.create(tenant, {
      incidentId: incident.id,
      body: "investigating",
      postedBy: "ic@example.com",
      postedAt: "2026-05-01T00:30:00.000Z",
      audience: "customer",
    });

    const { context } = makeContext({
      routes: { "GET /incidents/:id": getIncidentHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/summarize-timeline",
      method: "POST",
      body: { incidentId: incident.id },
      tenantId: tenant,
    });
    const response = await summarizeTimelineHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      durationMinutes: number;
      timeline: Array<{ kind: string; at: string }>;
    };
    expect(data.durationMinutes).toBe(60);
    expect(data.timeline.length).toBe(3); // declared + update + resolved
    // Sorted ascending by at
    const ordered = [...data.timeline].sort((a, b) => a.at.localeCompare(b.at));
    expect(data.timeline).toEqual(ordered);
  });

  it("returns 400 without incidentId", async () => {
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/summarize-timeline",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const response = await summarizeTimelineHandler(request, context);
    expect(response.status).toBe(400);
  });
});
