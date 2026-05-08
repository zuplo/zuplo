import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import {
  componentRepository,
} from "../modules/repositories/components.ts";
import {
  incidentRepository,
} from "../modules/repositories/incidents.ts";
import {
  incidentUpdateRepository,
} from "../modules/repositories/incident-updates.ts";
import {
  subscriberRepository,
} from "../modules/repositories/subscribers.ts";
import draftCustomerUpdateHandler from "../modules/mcp-tools/draft-customer-update.ts";
import openIncidentFromAlertHandler from "../modules/mcp-tools/open-incident-from-alert.ts";
import postPostmortemSummaryHandler from "../modules/mcp-tools/post-postmortem-summary.ts";
import openIncidentHandler from "../modules/handlers/open-incident.ts";
import postIncidentUpdateHandler from "../modules/handlers/post-incident-update.ts";
import updateComponentStatusHandler from "../modules/handlers/update-component-status.ts";
import getIncidentHandler from "../modules/handlers/get-incident.ts";

const ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "SLACK_BOT_TOKEN",
  "SLACK_WEBHOOK_URL",
];
function clearEnv() {
  for (const key of ENV_KEYS) {
    delete (environment as Record<string, string | undefined>)[key];
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  clearEnv();
  for (const tenant of ["tenant-a", "tenant-b"]) {
    for (const repo of [
      componentRepository,
      incidentRepository,
      incidentUpdateRepository,
      subscriberRepository,
    ]) {
      const page = await repo.list(tenant, { limit: 1000 });
      for (const item of page.items) {
        await repo.delete(tenant, item.id).catch(() => {});
      }
    }
  }
});

const NOW = "2026-05-08T00:00:00.000Z";

describe("orchestrator open_incident_from_alert", () => {
  it("opens incident, posts initial update, and bumps component statuses", async () => {
    const tenant = "tenant-a";
    const apiComp = await componentRepository.create(tenant, {
      slug: "api",
      name: "API",
      status: "operational",
      description: "x",
      parentSlug: null,
      displayOrder: 1,
      updatedAt: NOW,
    });
    await componentRepository.create(tenant, {
      slug: "web",
      name: "Web",
      status: "operational",
      description: "x",
      parentSlug: null,
      displayOrder: 2,
      updatedAt: NOW,
    });

    const { context, invokeCalls } = makeContext({
      routes: {
        "POST /incidents": openIncidentHandler,
        "POST /incidents/:id/updates": postIncidentUpdateHandler,
        "PATCH /components/:id/status": updateComponentStatusHandler,
      },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/open-incident-from-alert",
      method: "POST",
      body: {
        alertTitle: "API errors",
        severity: "major",
        affectedComponents: [apiComp.id],
      },
      tenantId: tenant,
    });
    const response = await openIncidentFromAlertHandler(request, context);
    expect(response.status).toBe(201);
    const data = (await response.json()) as {
      incident: { id: string; title: string; impact: string };
      initialUpdate: { id: string; status: string };
      componentUpdates: Array<{ slug: string; status: string }>;
    };
    expect(data.incident.title).toBe("API errors");
    expect(data.incident.impact).toBe("major");
    expect(data.initialUpdate.status).toBe("investigating");
    expect(data.componentUpdates).toEqual([
      { slug: apiComp.id, status: "partial_outage" },
    ]);

    // Validate the inner routes were invoked.
    const paths = invokeCalls.map((c) => `${c.method} ${c.path}`);
    expect(paths).toContain("POST /incidents");
    expect(paths.some((p) => p.startsWith("POST /incidents/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("PATCH /components/"))).toBe(true);
  });

  it("returns 400 when missing alertTitle / severity", async () => {
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/open-incident-from-alert",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const response = await openIncidentFromAlertHandler(request, context);
    expect(response.status).toBe(400);
  });

  it("severity=critical maps to major_outage on components", async () => {
    const tenant = "tenant-a";
    const comp = await componentRepository.create(tenant, {
      slug: "api",
      name: "API",
      status: "operational",
      description: "x",
      parentSlug: null,
      displayOrder: 1,
      updatedAt: NOW,
    });
    const { context } = makeContext({
      routes: {
        "POST /incidents": openIncidentHandler,
        "POST /incidents/:id/updates": postIncidentUpdateHandler,
        "PATCH /components/:id/status": updateComponentStatusHandler,
      },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/open-incident-from-alert",
      method: "POST",
      body: {
        alertTitle: "Total outage",
        severity: "critical",
        affectedComponents: [comp.id],
      },
      tenantId: tenant,
    });
    const response = await openIncidentFromAlertHandler(request, context);
    const data = (await response.json()) as {
      componentUpdates: Array<{ status: string }>;
    };
    expect(data.componentUpdates[0].status).toBe("major_outage");
  });
});

describe("orchestrator draft_customer_update", () => {
  it("returns customer-friendly text with elapsed time and component list", async () => {
    const tenant = "tenant-a";
    const incident = await incidentRepository.create(tenant, {
      title: "Errors on API",
      body: "x",
      status: "investigating",
      impact: "major",
      affectedComponentSlugs: ["api"],
      startedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      resolvedAt: null,
      kind: "incident",
      createdAt: NOW,
    });
    await incidentUpdateRepository.create(tenant, {
      incidentId: incident.id,
      body: "We see elevated 500s",
      postedAt: NOW,
      status: "investigating",
    });

    const { context } = makeContext({
      routes: {},
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/draft-customer-update",
      method: "POST",
      body: { incidentId: incident.id, audience: "customer" },
      tenantId: tenant,
    });
    const response = await draftCustomerUpdateHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      audience: string;
      currentStatus: string;
      timelineLength: number;
      draft: string;
    };
    expect(data.audience).toBe("customer");
    expect(data.timelineLength).toBe(1);
    expect(data.draft).toContain("api");
  });

  it("returns internal-style draft when audience=internal", async () => {
    const tenant = "tenant-a";
    const incident = await incidentRepository.create(tenant, {
      title: "Down",
      body: "x",
      status: "investigating",
      impact: "critical",
      affectedComponentSlugs: ["api", "web"],
      startedAt: NOW,
      resolvedAt: null,
      kind: "incident",
      createdAt: NOW,
    });
    const { context } = makeContext({ routes: {}, tenantId: tenant });
    const request = makeRequest({
      url: "https://kit.test/draft-customer-update",
      method: "POST",
      body: { incidentId: incident.id, audience: "internal" },
      tenantId: tenant,
    });
    const response = await draftCustomerUpdateHandler(request, context);
    const data = (await response.json()) as { draft: string };
    expect(data.draft).toContain("Incident");
    expect(data.draft).toContain(incident.id);
  });

  it("returns 404 for unknown incident", async () => {
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/draft-customer-update",
      method: "POST",
      body: { incidentId: "nope" },
      tenantId: "tenant-a",
    });
    const response = await draftCustomerUpdateHandler(request, context);
    expect(response.status).toBe(404);
  });

  it("returns 400 when missing incidentId", async () => {
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/draft-customer-update",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const response = await draftCustomerUpdateHandler(request, context);
    expect(response.status).toBe(400);
  });
});

describe("orchestrator post_postmortem_summary", () => {
  it("posts a final timeline update via /incidents/:id/updates", async () => {
    const tenant = "tenant-a";
    const incident = await incidentRepository.create(tenant, {
      title: "Outage",
      body: "x",
      status: "resolved",
      impact: "major",
      affectedComponentSlugs: [],
      startedAt: NOW,
      resolvedAt: NOW,
      kind: "incident",
      createdAt: NOW,
    });
    const { context, invokeCalls } = makeContext({
      routes: {
        "POST /incidents/:id/updates": postIncidentUpdateHandler,
      },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/post-postmortem-summary",
      method: "POST",
      body: {
        incidentId: incident.id,
        postmortemText: "Root cause: bad deploy",
      },
      tenantId: tenant,
    });
    const response = await postPostmortemSummaryHandler(request, context);
    expect(response.status).toBe(201);
    const data = (await response.json()) as {
      excerptLength: number;
      truncated: boolean;
      update: { id: string };
    };
    expect(data.truncated).toBe(false);
    expect(invokeCalls.some((c) =>
      c.path.startsWith(`/incidents/${incident.id}/updates`),
    )).toBe(true);

    // The update should exist
    const updates = await incidentUpdateRepository.list(tenant, { limit: 100 });
    expect(updates.items[0].body).toContain("Root cause");
    expect(updates.items[0].status).toBe("resolved");
  });

  it("truncates long postmortem text", async () => {
    const tenant = "tenant-a";
    const incident = await incidentRepository.create(tenant, {
      title: "Outage",
      body: "x",
      status: "resolved",
      impact: "major",
      affectedComponentSlugs: [],
      startedAt: NOW,
      resolvedAt: NOW,
      kind: "incident",
      createdAt: NOW,
    });
    const { context } = makeContext({
      routes: {
        "POST /incidents/:id/updates": postIncidentUpdateHandler,
      },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/post-postmortem-summary",
      method: "POST",
      body: {
        incidentId: incident.id,
        postmortemText: "a".repeat(2000),
        postmortemUrl: "https://example.com/pm",
      },
      tenantId: tenant,
    });
    const response = await postPostmortemSummaryHandler(request, context);
    const data = (await response.json()) as {
      truncated: boolean;
      excerptLength: number;
    };
    expect(data.truncated).toBe(true);
    expect(data.excerptLength).toBeLessThan(2000);
  });

  it("returns 400 missing fields", async () => {
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/post-postmortem-summary",
      method: "POST",
      body: { incidentId: "x" }, // postmortemText missing
      tenantId: "tenant-a",
    });
    const response = await postPostmortemSummaryHandler(request, context);
    expect(response.status).toBe(400);
  });
});
