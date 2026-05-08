import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import sendForSignature from "../modules/mcp-tools/send-for-signature.ts";
import draftStatusLetter from "../modules/mcp-tools/draft-status-letter-to-client.ts";
import checkConflict from "../modules/mcp-tools/check-conflict-before-intake.ts";
import summarizeMatter from "../modules/mcp-tools/summarize-matter-status.ts";
import addDeadline from "../modules/handlers/add-deadline.ts";
import getMatter from "../modules/handlers/get-matter.ts";
import getClient from "../modules/handlers/get-client.ts";
import listClients from "../modules/handlers/list-clients.ts";
import listMatters from "../modules/handlers/list-matters.ts";
import listDeadlines from "../modules/handlers/list-deadlines.ts";
import listDocuments from "../modules/handlers/list-documents.ts";
import listTimeEntries from "../modules/handlers/list-time-entries.ts";
import {
  matterRepository,
  clientRepository,
  deadlineRepository,
  matterDocumentRepository,
  matterTimeEntryRepository,
  signatureEnvelopeRepository,
  type Matter,
  type Client,
  type Deadline,
  type MatterDocument,
  type MatterTimeEntry,
} from "../modules/repositories/matters.ts";
import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";

const env = environment as Record<string, string | undefined>;

function setEnv(key: string, value: string) {
  env[key] = value;
}
function clearEnv(...keys: string[]) {
  for (const k of keys) delete env[k];
}

const routes = {
  "GET /matters": (req: ZuploRequest, ctx: ZuploContext) => listMatters(req, ctx),
  "GET /matters/:id": (req: ZuploRequest, ctx: ZuploContext) => getMatter(req, ctx),
  "GET /clients": (req: ZuploRequest, ctx: ZuploContext) => listClients(req, ctx),
  "GET /clients/:id": (req: ZuploRequest, ctx: ZuploContext) => getClient(req, ctx),
  "GET /deadlines": (req: ZuploRequest, ctx: ZuploContext) => listDeadlines(req, ctx),
  "GET /documents": (req: ZuploRequest, ctx: ZuploContext) => listDocuments(req, ctx),
  "GET /time-entries": (req: ZuploRequest, ctx: ZuploContext) => listTimeEntries(req, ctx),
};

async function seedClient(tenantId: string, overrides: Partial<Client> = {}): Promise<Client> {
  return clientRepository.create(tenantId, {
    name: "Acme Corp",
    kind: "organization",
    email: "client@example.com",
    phone: "+15550100",
    billingAddress: "123 Main",
    conflicts: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  });
}

async function seedMatter(
  tenantId: string,
  clientId: string,
  overrides: Partial<Matter> = {},
): Promise<Matter> {
  return matterRepository.create(tenantId, {
    title: "Acme v. Bigco",
    clientId,
    kind: "litigation",
    status: "open",
    openedAt: "2025-12-01T00:00:00Z",
    closedAt: null,
    leadAttorneyEmail: "lead@firm.example",
    billingType: "hourly",
    description: "Patent infringement",
    createdAt: "2025-12-01T00:00:00Z",
    ...overrides,
  });
}

describe("orchestrator: send_for_signature", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("DOCUSIGN_BASE_URL", "DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_ACCESS_TOKEN");
  });

  it("happy path: creates DocuSign envelope, persists tracker with tenantId customField", async () => {
    setEnv("DOCUSIGN_BASE_URL", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "act_1");
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_token");
    const tenantId = "tenant-sig-1";
    const client = await seedClient(tenantId);
    const matter = await seedMatter(tenantId, client.id);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          envelopeId: "env_x",
          status: "sent",
          statusDateTime: "2026-02-01T15:00:00Z",
          uri: "/envelopes/env_x",
        }),
        { status: 201 },
      ),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/send-for-signature",
      method: "POST",
      body: {
        matterId: matter.id,
        documentBase64: "cGRm",
        documentName: "Engagement.pdf",
        fileExtension: "pdf",
      },
      tenantId,
    });

    const response = await sendForSignature(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      envelopeId: string;
      tracker: { id: string };
    };
    expect(json.envelopeId).toBe("env_x");

    // The DocuSign request body must include matterId+tenantId customFields.
    const sentBody = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const tFields = sentBody.customFields.textCustomFields as Array<{ name: string; value: string }>;
    expect(tFields.find((f) => f.name === "tenantId")?.value).toBe(tenantId);
    expect(tFields.find((f) => f.name === "matterId")?.value).toBe(matter.id);

    // Tracker is persisted.
    const stored = await signatureEnvelopeRepository.get(tenantId, json.tracker.id);
    expect(stored?.envelopeId).toBe("env_x");
  });

  it("returns 400 when required body fields are missing", async () => {
    const tenantId = "tenant-sig-bad";
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/send-for-signature",
      method: "POST",
      body: { matterId: "m1" }, // missing documentBase64 + documentName
      tenantId,
    });

    const response = await sendForSignature(request, context);
    expect(response.status).toBe(400);
  });

  it("does not see another tenant's matter (route returns 404)", async () => {
    setEnv("DOCUSIGN_BASE_URL", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "act_1");
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_token");
    const tenantA = "tenant-sig-iso-a";
    const tenantB = "tenant-sig-iso-b";
    const client = await seedClient(tenantB);
    const matter = await seedMatter(tenantB, client.id);

    const { context } = makeContext({ routes, tenantId: tenantA });
    const request = makeRequest({
      url: "https://kit.test/send-for-signature",
      method: "POST",
      body: {
        matterId: matter.id,
        documentBase64: "cGRm",
        documentName: "x.pdf",
        fileExtension: "pdf",
      },
      tenantId: tenantA,
    });

    await expect(sendForSignature(request, context)).rejects.toThrow();
  });
});

describe("orchestrator: draft_status_letter_to_client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RESEND_API_KEY", "RESEND_FROM_EMAIL");
  });

  it("draft-only path returns letter without calling Resend (send=false)", async () => {
    const tenantId = "tenant-draft-1";
    const client = await seedClient(tenantId);
    const matter = await seedMatter(tenantId, client.id);

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/draft-status-letter",
      method: "POST",
      body: { matterId: matter.id },
      tenantId,
    });

    const response = await draftStatusLetter(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      sent: boolean;
      sentMessageId: string | null;
      draftLetter: string;
    };
    expect(json.sent).toBe(false);
    expect(json.sentMessageId).toBeNull();
    expect(json.draftLetter).toContain(client.name);
    expect(json.draftLetter).toContain(matter.title);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("send=true emails the letter via Resend", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@firm.example");
    const tenantId = "tenant-draft-send";
    const client = await seedClient(tenantId, { email: "client@example.com" });
    const matter = await seedMatter(tenantId, client.id);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "re_letter" }), { status: 200 }),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/draft-status-letter",
      method: "POST",
      body: { matterId: matter.id, send: true },
      tenantId,
    });

    const response = await draftStatusLetter(request, context);
    const json = (await response.json()) as {
      sent: boolean;
      sentMessageId: string | null;
      sendError: string | null;
    };
    expect(json.sent).toBe(true);
    expect(json.sentMessageId).toBe("re_letter");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.resend.com");
  });

  it("returns 400 when matterId is missing", async () => {
    const tenantId = "tenant-draft-bad";
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/draft-status-letter",
      method: "POST",
      body: {},
      tenantId,
    });
    const response = await draftStatusLetter(request, context);
    expect(response.status).toBe(400);
  });

  it("captures sendError when Resend fails (send=true)", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@firm.example");
    const tenantId = "tenant-draft-fail";
    const client = await seedClient(tenantId);
    const matter = await seedMatter(tenantId, client.id);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limit", { status: 429 }),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/draft-status-letter",
      method: "POST",
      body: { matterId: matter.id, send: true },
      tenantId,
    });

    const response = await draftStatusLetter(request, context);
    const json = (await response.json()) as {
      sent: boolean;
      sendError: string | null;
    };
    expect(json.sent).toBe(false);
    expect(json.sendError).toMatch(/429/);
  });
});

describe("orchestrator: check_conflict_before_intake", () => {
  afterEach(() => vi.restoreAllMocks());

  it("flags an existing client whose name overlaps with the prospect's name", async () => {
    const tenantId = "tenant-conflict-1";
    await seedClient(tenantId, { name: "Acme Corporation", conflicts: [] });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/check-conflict-before-intake",
      method: "POST",
      body: { prospectName: "Acme LLC" },
      tenantId,
    });

    const response = await checkConflict(request, context);
    const json = (await response.json()) as {
      hasFlags: boolean;
      flaggedClients: Array<{ name: string }>;
    };
    expect(json.hasFlags).toBe(true);
    expect(json.flaggedClients[0].name).toContain("Acme");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns no flags when there's no overlap", async () => {
    const tenantId = "tenant-conflict-empty";
    await seedClient(tenantId, { name: "Different Inc" });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/check-conflict-before-intake",
      method: "POST",
      body: { prospectName: "Acme LLC" },
      tenantId,
    });

    const response = await checkConflict(request, context);
    const json = (await response.json()) as {
      hasFlags: boolean;
      flaggedClients: unknown[];
    };
    expect(json.hasFlags).toBe(false);
    expect(json.flaggedClients).toEqual([]);
  });

  it("returns 400 when prospectName is missing", async () => {
    const { context } = makeContext({ routes, tenantId: "t-conf-bad" });
    const request = makeRequest({
      url: "https://kit.test/check-conflict-before-intake",
      method: "POST",
      body: {},
      tenantId: "t-conf-bad",
    });
    const response = await checkConflict(request, context);
    expect(response.status).toBe(400);
  });
});

describe("orchestrator: summarize_matter_status", () => {
  afterEach(() => vi.restoreAllMocks());

  it("aggregates deadlines, docs, and time entries for the matter", async () => {
    const tenantId = "tenant-sum-1";
    const client = await seedClient(tenantId);
    const matter = await seedMatter(tenantId, client.id);

    await deadlineRepository.create(tenantId, {
      matterId: matter.id,
      title: "Hearing",
      dueDate: "2026-04-01",
      kind: "court",
      status: "upcoming",
      calendarEventId: null,
      createdAt: new Date().toISOString(),
    } as Omit<Deadline, "id" | "tenantId">);

    await matterDocumentRepository.create(tenantId, {
      matterId: matter.id,
      kind: "pleading",
      title: "Complaint",
      fileUrl: "https://x",
      uploadedAt: "2026-01-15T00:00:00Z",
      uploadedBy: "lead@firm.example",
      privileged: false,
      createdAt: "2026-01-15T00:00:00Z",
    } as Omit<MatterDocument, "id" | "tenantId">);

    await matterTimeEntryRepository.create(tenantId, {
      matterId: matter.id,
      attorneyEmail: "lead@firm.example",
      durationMinutes: 60,
      billable: true,
      narrative: "draft brief",
      performedAt: "2026-01-20T00:00:00Z",
      createdAt: "2026-01-20T00:00:00Z",
    } as Omit<MatterTimeEntry, "id" | "tenantId">);

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/summarize-matter-status",
      method: "POST",
      body: { matterId: matter.id },
      tenantId,
    });

    const response = await summarizeMatter(request, context);
    const json = (await response.json()) as {
      openDeadlineCount: number;
      recentDocuments: unknown[];
      recentBillableMinutes: number;
    };
    expect(json.openDeadlineCount).toBe(1);
    expect(json.recentDocuments).toHaveLength(1);
    expect(json.recentBillableMinutes).toBe(60);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when matterId is missing", async () => {
    const { context } = makeContext({ routes, tenantId: "t-sumstat-bad" });
    const request = makeRequest({
      url: "https://kit.test/summarize-matter-status",
      method: "POST",
      body: {},
      tenantId: "t-sumstat-bad",
    });
    const response = await summarizeMatter(request, context);
    expect(response.status).toBe(400);
  });
});

describe("orchestrator-ish: add_deadline (uses Google Calendar)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("GOOGLE_CALENDAR_ACCESS_TOKEN");
  });

  it("creates a calendar event for the deadline (default behavior)", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    const tenantId = "tenant-deadline-1";
    const client = await seedClient(tenantId);
    const matter = await seedMatter(tenantId, client.id);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "evt_dead", htmlLink: "https://cal" }), { status: 200 }),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/deadlines",
      method: "POST",
      body: {
        matterId: matter.id,
        title: "Discovery cutoff",
        dueDate: "2026-04-01",
        kind: "court",
      },
      tenantId,
    });

    const response = await addDeadline(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      calendarEventId: string | null;
      calendarError: string | null;
      deadline: { calendarEventId: string | null };
    };
    expect(json.calendarEventId).toBe("evt_dead");
    expect(json.calendarError).toBeNull();
    expect(json.deadline.calendarEventId).toBe("evt_dead");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("silent=true skips Calendar event but still creates deadline", async () => {
    const tenantId = "tenant-deadline-silent";
    const client = await seedClient(tenantId);
    const matter = await seedMatter(tenantId, client.id);

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/deadlines",
      method: "POST",
      body: {
        matterId: matter.id,
        title: "Internal review",
        dueDate: "2026-04-15",
        kind: "internal",
        silent: true,
      },
      tenantId,
    });

    const response = await addDeadline(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as { calendarEventId: string | null };
    expect(json.calendarEventId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("captures calendarError when GCal fails but still creates the deadline row", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    const tenantId = "tenant-deadline-fail";
    const client = await seedClient(tenantId);
    const matter = await seedMatter(tenantId, client.id);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("oops", { status: 500 }));

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/deadlines",
      method: "POST",
      body: {
        matterId: matter.id,
        title: "x",
        dueDate: "2026-04-01",
        kind: "court",
      },
      tenantId,
    });

    const response = await addDeadline(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      calendarEventId: string | null;
      calendarError: string | null;
      deadline: { id: string };
    };
    expect(json.calendarEventId).toBeNull();
    expect(json.calendarError).toMatch(/500/);
    // Deadline row was still persisted.
    const stored = await deadlineRepository.get(tenantId, json.deadline.id);
    expect(stored).not.toBeNull();
  });
});
