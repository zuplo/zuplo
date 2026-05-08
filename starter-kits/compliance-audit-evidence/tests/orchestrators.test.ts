import { afterEach, describe, expect, it, vi } from "vitest";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import {
  controlRepository,
  evidenceRepository,
  findingRepository,
} from "../modules/repositories/evidence.ts";
import draftAuditResponseHandler from "../modules/mcp-tools/draft-audit-response.ts";
import flagStaleEvidenceHandler from "../modules/mcp-tools/flag-stale-evidence.ts";
import mapEvidenceToControlHandler from "../modules/mcp-tools/map-evidence-to-control.ts";
import getControlHandler from "../modules/handlers/get-control.ts";
import listControlsHandler from "../modules/handlers/list-controls.ts";
import listEvidenceHandler from "../modules/handlers/list-evidence.ts";
import listFindingsHandler from "../modules/handlers/list-findings.ts";
import markEvidenceStaleHandler from "../modules/handlers/mark-evidence-stale.ts";

afterEach(async () => {
  vi.restoreAllMocks();
  for (const tenant of ["tenant-a", "tenant-b"]) {
    for (const repo of [
      controlRepository,
      evidenceRepository,
      findingRepository,
    ]) {
      const page = await repo.list(tenant, { limit: 1000 });
      for (const item of page.items) {
        await repo.delete(tenant, item.id).catch(() => {});
      }
    }
  }
});

const NOW_ISO = "2026-05-08T00:00:00.000Z";

async function seedControlAndFinding(tenant: string) {
  const control = await controlRepository.create(tenant, {
    slug: "CC6.1",
    framework: "soc2",
    domain: "access",
    title: "Logical Access Controls",
    description: "...",
    evidenceFrequencyDays: 90,
    owner: "owner@example.com",
    createdAt: NOW_ISO,
  });
  const finding = await findingRepository.create(tenant, {
    auditCycleId: "ac1",
    controlId: control.id,
    severity: "med",
    description: "Missing review",
    status: "open",
    closedAt: null,
    owner: "owner@example.com",
    createdAt: NOW_ISO,
  });
  return { control, finding };
}

describe("orchestrator draft_audit_response", () => {
  it("hydrates finding + control + linked evidence into a draft response", async () => {
    const tenant = "tenant-a";
    const { control, finding } = await seedControlAndFinding(tenant);

    await evidenceRepository.create(tenant, {
      controlId: control.id,
      kind: "log",
      title: "Q1 access review",
      description: "...",
      fileUrl: "https://r2/a.json",
      sha256: "abc",
      collectedAt: NOW_ISO,
      collectedBy: "alice@example.com",
      validUntil: null,
      status: "current",
      createdAt: NOW_ISO,
    });

    const { context } = makeContext({
      routes: {
        "GET /findings": listFindingsHandler,
        "GET /controls/:id": getControlHandler,
        "GET /evidence": listEvidenceHandler,
      },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/draft-audit-response",
      method: "POST",
      body: { findingId: finding.id },
      tenantId: tenant,
    });
    const response = await draftAuditResponseHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      finding: { id: string };
      control: { slug: string };
      linkedEvidence: Array<{ title: string }>;
      draftResponse: string;
    };
    expect(data.finding.id).toBe(finding.id);
    expect(data.control.slug).toBe("CC6.1");
    expect(data.linkedEvidence.length).toBe(1);
    expect(data.draftResponse).toContain("CC6.1");
    expect(data.draftResponse).toContain("Q1 access review");
  });

  it("404s when finding not found", async () => {
    const { context } = makeContext({
      routes: { "GET /findings": listFindingsHandler },
      tenantId: "tenant-a",
    });
    const request = makeRequest({
      url: "https://kit.test/draft-audit-response",
      method: "POST",
      body: { findingId: "nope" },
      tenantId: "tenant-a",
    });
    const response = await draftAuditResponseHandler(request, context);
    expect(response.status).toBe(404);
  });

  it("respects multi-tenant isolation — finding from other tenant invisible", async () => {
    const { finding } = await seedControlAndFinding("tenant-b");
    const { context } = makeContext({
      routes: { "GET /findings": listFindingsHandler },
      tenantId: "tenant-a",
    });
    const request = makeRequest({
      url: "https://kit.test/draft-audit-response",
      method: "POST",
      body: { findingId: finding.id },
      tenantId: "tenant-a",
    });
    const response = await draftAuditResponseHandler(request, context);
    expect(response.status).toBe(404);
  });
});

describe("orchestrator flag_stale_evidence", () => {
  it("PATCHes stale evidence via /evidence/:id/stale", async () => {
    const tenant = "tenant-a";
    const control = await controlRepository.create(tenant, {
      slug: "CC6.1",
      framework: "soc2",
      domain: "access",
      title: "Access",
      description: "x",
      evidenceFrequencyDays: 30,
      owner: "owner@example.com",
      createdAt: NOW_ISO,
    });
    const oldCollected = new Date(Date.now() - 60 * 86400000).toISOString();
    const fresh = await evidenceRepository.create(tenant, {
      controlId: control.id,
      kind: "log",
      title: "Old log",
      description: "x",
      fileUrl: "https://r2/x",
      sha256: "abc",
      collectedAt: oldCollected,
      collectedBy: "x",
      validUntil: null,
      status: "current",
      createdAt: oldCollected,
    });

    const { context } = makeContext({
      routes: {
        "GET /evidence": listEvidenceHandler,
        "GET /controls": listControlsHandler,
        "PATCH /evidence/:id/stale": markEvidenceStaleHandler,
      },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/flag-stale-evidence",
      method: "POST",
      body: {},
      tenantId: tenant,
    });
    const response = await flagStaleEvidenceHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      count: number;
      flagged: Array<{ daysOverdue: number }>;
    };
    expect(data.count).toBe(1);
    expect(data.flagged[0].daysOverdue).toBeGreaterThan(0);

    const after = await evidenceRepository.get(tenant, fresh.id);
    expect(after?.status).toBe("stale");
  });

  it("respects framework filter", async () => {
    const tenant = "tenant-a";
    const ctrlA = await controlRepository.create(tenant, {
      slug: "CC6.1",
      framework: "soc2",
      domain: "access",
      title: "A",
      description: "x",
      evidenceFrequencyDays: 30,
      owner: "x",
      createdAt: NOW_ISO,
    });
    const ctrlB = await controlRepository.create(tenant, {
      slug: "A.5",
      framework: "iso27001",
      domain: "access",
      title: "B",
      description: "x",
      evidenceFrequencyDays: 30,
      owner: "x",
      createdAt: NOW_ISO,
    });
    const old = new Date(Date.now() - 60 * 86400000).toISOString();
    await evidenceRepository.create(tenant, {
      controlId: ctrlA.id,
      kind: "log",
      title: "soc2 old",
      description: "x",
      fileUrl: "https://r2/a",
      sha256: "abc",
      collectedAt: old,
      collectedBy: "x",
      validUntil: null,
      status: "current",
      createdAt: old,
    });
    await evidenceRepository.create(tenant, {
      controlId: ctrlB.id,
      kind: "log",
      title: "iso old",
      description: "x",
      fileUrl: "https://r2/b",
      sha256: "abc",
      collectedAt: old,
      collectedBy: "x",
      validUntil: null,
      status: "current",
      createdAt: old,
    });

    const { context } = makeContext({
      routes: {
        "GET /evidence": listEvidenceHandler,
        "GET /controls": listControlsHandler,
        "PATCH /evidence/:id/stale": markEvidenceStaleHandler,
      },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/flag-stale-evidence",
      method: "POST",
      body: { framework: "soc2" },
      tenantId: tenant,
    });
    const response = await flagStaleEvidenceHandler(request, context);
    const data = (await response.json()) as { count: number };
    expect(data.count).toBe(1);
  });

  it("returns count=0 when nothing is stale", async () => {
    const tenant = "tenant-a";
    const control = await controlRepository.create(tenant, {
      slug: "CC6.1",
      framework: "soc2",
      domain: "access",
      title: "Access",
      description: "x",
      evidenceFrequencyDays: 90,
      owner: "x",
      createdAt: NOW_ISO,
    });
    const recent = new Date(Date.now() - 1 * 86400000).toISOString();
    await evidenceRepository.create(tenant, {
      controlId: control.id,
      kind: "log",
      title: "Fresh",
      description: "x",
      fileUrl: "https://r2/x",
      sha256: "abc",
      collectedAt: recent,
      collectedBy: "x",
      validUntil: null,
      status: "current",
      createdAt: recent,
    });
    const { context } = makeContext({
      routes: {
        "GET /evidence": listEvidenceHandler,
        "GET /controls": listControlsHandler,
        "PATCH /evidence/:id/stale": markEvidenceStaleHandler,
      },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/flag-stale-evidence",
      method: "POST",
      body: {},
      tenantId: tenant,
    });
    const response = await flagStaleEvidenceHandler(request, context);
    const data = (await response.json()) as { count: number };
    expect(data.count).toBe(0);
  });
});

describe("orchestrator map_evidence_to_control", () => {
  it("returns evidence linked to a control with currentness flag", async () => {
    const tenant = "tenant-a";
    const control = await controlRepository.create(tenant, {
      slug: "CC6.1",
      framework: "soc2",
      domain: "access",
      title: "Access",
      description: "x",
      evidenceFrequencyDays: 90,
      owner: "x",
      createdAt: NOW_ISO,
    });
    const recent = new Date(Date.now() - 1 * 86400000).toISOString();
    const old = new Date(Date.now() - 200 * 86400000).toISOString();
    await evidenceRepository.create(tenant, {
      controlId: control.id,
      kind: "log",
      title: "Fresh",
      description: "x",
      fileUrl: "https://r2/x",
      sha256: "abc",
      collectedAt: recent,
      collectedBy: "x",
      validUntil: null,
      status: "current",
      createdAt: recent,
    });
    await evidenceRepository.create(tenant, {
      controlId: control.id,
      kind: "log",
      title: "Old",
      description: "x",
      fileUrl: "https://r2/y",
      sha256: "def",
      collectedAt: old,
      collectedBy: "x",
      validUntil: null,
      status: "current",
      createdAt: old,
    });

    const { context } = makeContext({
      routes: {
        "GET /controls/:id": getControlHandler,
        "GET /evidence": listEvidenceHandler,
      },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/map-evidence-to-control",
      method: "POST",
      body: { controlId: control.id },
      tenantId: tenant,
    });
    const response = await mapEvidenceToControlHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      count: number;
      currentCount: number;
      staleCount: number;
    };
    expect(data.count).toBe(2);
    expect(data.currentCount).toBe(1);
    expect(data.staleCount).toBe(1);
  });
});
