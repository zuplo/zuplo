import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import accountTimeline from "../modules/mcp-tools/account-timeline.ts";
import findWarmIntro from "../modules/mcp-tools/find-warm-intro.ts";
import pipelineSummary from "../modules/mcp-tools/pipeline-summary-by-owner.ts";
import logActivity from "../modules/handlers/log-activity.ts";
import listAccounts from "../modules/handlers/list-accounts.ts";
import listContacts from "../modules/handlers/list-contacts.ts";
import listDeals from "../modules/handlers/list-deals.ts";
import listActivities from "../modules/handlers/list-activities.ts";
import createAccount from "../modules/handlers/create-account.ts";
import createContact from "../modules/handlers/create-contact.ts";
import createDeal from "../modules/handlers/create-deal.ts";
import { accountRepository } from "../modules/repositories/accounts.ts";
import { contactRepository } from "../modules/repositories/contacts.ts";
import { dealRepository } from "../modules/repositories/deals.ts";
import { activityRepository } from "../modules/repositories/activities.ts";

const routes = {
  "GET /accounts": listAccounts,
  "POST /accounts": createAccount,
  "GET /contacts": listContacts,
  "POST /contacts": createContact,
  "GET /deals": listDeals,
  "POST /deals": createDeal,
  "GET /activities": listActivities,
};

async function seedAccount(tenantId: string, id: string, name: string) {
  return accountRepository.create(tenantId, {
    name,
    domain: null,
    industry: null,
    sizeBucket: "smb",
    ownerEmail: "rep@example.com",
    annualRevenueCents: null,
    createdAt: new Date().toISOString(),
  });
}

async function seedContact(
  tenantId: string,
  accountId: string,
  email: string,
  ownerEmail = "rep@example.com",
) {
  return contactRepository.create(tenantId, {
    firstName: "First",
    lastName: "Last",
    email,
    phone: null,
    title: null,
    accountId,
    ownerEmail,
    createdAt: new Date().toISOString(),
  });
}

async function seedDeal(
  tenantId: string,
  accountId: string,
  ownerEmail = "rep@example.com",
  stage: "prospect" | "qualified" | "proposal" | "negotiation" | "closed_won" =
    "qualified",
  amountCents = 100_000,
) {
  const now = new Date().toISOString();
  return dealRepository.create(tenantId, {
    accountId,
    contactId: null,
    name: `Deal ${accountId}`,
    ownerEmail,
    stage,
    amountCents,
    currency: "USD",
    expectedCloseDate: "2026-06-01",
    probability: 50,
    source: null,
    createdAt: now,
    updatedAt: now,
  });
}

async function seedActivity(
  tenantId: string,
  ownerEmail: string,
  opts: {
    accountId?: string | null;
    contactId?: string | null;
    occurredAt?: string;
    kind?: "email" | "call" | "meeting" | "note";
  } = {},
) {
  return activityRepository.create(tenantId, {
    kind: opts.kind ?? "email",
    subject: "test",
    body: "test body",
    dealId: null,
    contactId: opts.contactId ?? null,
    accountId: opts.accountId ?? null,
    occurredAt: opts.occurredAt ?? new Date().toISOString(),
    ownerEmail,
  });
}

async function clearAll(tenantId: string) {
  for (const repo of [
    accountRepository,
    contactRepository,
    dealRepository,
    activityRepository,
  ]) {
    let cursor: string | null | undefined = null;
    do {
      const page = await repo.list(tenantId, { limit: 200, cursor });
      for (const item of page.items) {
        await repo.delete(tenantId, item.id);
      }
      cursor = page.nextCursor;
    } while (cursor);
  }
}

describe("orchestrators/account-timeline", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });

  it("returns merged events and summary when summarize=true", async () => {
    const account = await seedAccount(tenantId, "x", "Acme Corp");
    const contact = await seedContact(tenantId, account.id, "alice@acme.com");
    await seedDeal(tenantId, account.id);
    await seedActivity(tenantId, "rep@example.com", {
      accountId: account.id,
      occurredAt: "2026-04-01T10:00:00Z",
    });
    await seedActivity(tenantId, "rep@example.com", {
      contactId: contact.id,
      occurredAt: "2026-04-02T10:00:00Z",
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "msg_x",
          model: "claude-sonnet-4-7",
          content: [{ type: "text", text: "Acme has had recent activity..." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 30 },
        }),
        { status: 200 },
      ),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/account-timeline",
      method: "POST",
      body: { accountId: account.id, summarize: true },
      tenantId,
    });

    const response = await accountTimeline(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      accountId: string;
      count: number;
      events: Array<{ kind: string; refId: string }>;
      summary?: string;
    };
    expect(json.accountId).toBe(account.id);
    expect(json.count).toBeGreaterThanOrEqual(3);
    expect(json.summary).toContain("Acme has had recent activity");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
  });

  it("does not call Claude when summarize is false (no-op AI path)", async () => {
    const account = await seedAccount(tenantId, "x", "Acme");
    await seedActivity(tenantId, "rep@example.com", {
      accountId: account.id,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/account-timeline",
      method: "POST",
      body: { accountId: account.id, summarize: false },
      tenantId,
    });

    const response = await accountTimeline(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { summary?: string };
    expect(json.summary).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns empty events for an account with nothing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/account-timeline",
      method: "POST",
      body: { accountId: "missing-account" },
      tenantId,
    });

    const response = await accountTimeline(request, context);
    const json = (await response.json()) as { count: number; summary?: string };
    expect(json.count).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("includes calendar events when GOOGLE_CALENDAR_ACCESS_TOKEN is set", async () => {
    process.env.GOOGLE_CALENDAR_ACCESS_TOKEN = "ya29.test";
    const account = await seedAccount(tenantId, "x", "Acme");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "evt1",
              summary: "Discovery",
              start: { dateTime: "2026-04-01T10:00:00Z" },
              end: { dateTime: "2026-04-01T11:00:00Z" },
              attendees: [{ email: "alice@acme.com" }],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/account-timeline",
      method: "POST",
      body: {
        accountId: account.id,
        calendarAttendees: ["alice@acme.com"],
        calendarDaysBack: 30,
      },
      tenantId,
    });

    const response = await accountTimeline(request, context);
    const json = (await response.json()) as {
      events: Array<{ kind: string; refId: string }>;
    };
    expect(json.events.some((e) => e.kind === "calendar")).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("isolates events to caller's tenant", async () => {
    const accountA = await seedAccount(tenantId, "x", "Acme A");
    await seedActivity(tenantId, "rep@example.com", {
      accountId: accountA.id,
      occurredAt: "2026-04-01T10:00:00Z",
    });
    // Same accountId could exist in tenant-b — but we seed a different account
    const accountB = await seedAccount("tenant-b", "x", "Other Corp");
    await seedActivity("tenant-b", "rival@other.com", {
      accountId: accountB.id,
      occurredAt: "2026-04-02T10:00:00Z",
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/account-timeline",
      method: "POST",
      body: { accountId: accountA.id },
      tenantId,
    });

    const response = await accountTimeline(request, context);
    const json = (await response.json()) as {
      events: Array<{ ownerEmail: string }>;
    };
    expect(
      json.events.every((e) => e.ownerEmail === "rep@example.com"),
    ).toBe(true);
    expect(json.events.every((e) => e.ownerEmail !== "rival@other.com")).toBe(
      true,
    );
  });
});

describe("orchestrators/find-warm-intro", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });
  afterEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });

  it("returns owners who have touched both target and other accounts", async () => {
    const target = await seedAccount(tenantId, "x", "Target");
    const other = await seedAccount(tenantId, "y", "Other");
    const targetContact = await seedContact(tenantId, target.id, "a@t.com");
    await seedContact(tenantId, other.id, "b@o.com");

    // Owner1 worked both
    await seedActivity(tenantId, "owner1@example.com", {
      accountId: target.id,
    });
    await seedActivity(tenantId, "owner1@example.com", {
      accountId: other.id,
    });
    // Owner2 worked only target
    await seedActivity(tenantId, "owner2@example.com", {
      contactId: targetContact.id,
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/find-warm-intro",
      method: "POST",
      body: { targetAccountId: target.id },
      tenantId,
    });
    const response = await findWarmIntro(request, context);
    const json = (await response.json()) as {
      paths: Array<{
        ownerEmail: string;
        alsoWorkedWithAccountId: string;
      }>;
    };
    expect(json.paths.length).toBeGreaterThanOrEqual(1);
    const owner1Path = json.paths.find((p) => p.ownerEmail === "owner1@example.com");
    expect(owner1Path).toBeDefined();
    expect(owner1Path!.alsoWorkedWithAccountId).toBe(other.id);
  });

  it("returns no paths when nothing matches", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/find-warm-intro",
      method: "POST",
      body: { targetAccountId: "no-such-account" },
      tenantId,
    });
    const response = await findWarmIntro(request, context);
    const json = (await response.json()) as { paths: unknown[]; count: number };
    expect(json.paths).toEqual([]);
    expect(json.count).toBe(0);
  });

  it("isolates results to caller's tenant", async () => {
    const target = await seedAccount(tenantId, "x", "Target A");
    await seedActivity(tenantId, "ownerA@example.com", {
      accountId: target.id,
    });
    const targetB = await seedAccount("tenant-b", "x", "Target B");
    await seedActivity("tenant-b", "ownerB@example.com", {
      accountId: targetB.id,
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/find-warm-intro",
      method: "POST",
      body: { targetAccountId: target.id },
      tenantId,
    });
    const response = await findWarmIntro(request, context);
    const json = (await response.json()) as {
      paths: Array<{ ownerEmail: string }>;
    };
    expect(
      json.paths.every((p) => p.ownerEmail !== "ownerB@example.com"),
    ).toBe(true);
  });
});

describe("orchestrators/pipeline-summary-by-owner", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });
  afterEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });

  it("groups open deals by owner with stage breakdown", async () => {
    const a = await seedAccount(tenantId, "x", "A");
    await seedDeal(tenantId, a.id, "alice@example.com", "qualified", 50_000);
    await seedDeal(tenantId, a.id, "alice@example.com", "proposal", 75_000);
    await seedDeal(tenantId, a.id, "bob@example.com", "negotiation", 30_000);
    await seedDeal(tenantId, a.id, "alice@example.com", "closed_won", 999_999); // excluded

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/pipeline-summary-by-owner",
      method: "POST",
      body: {},
      tenantId,
    });
    const response = await pipelineSummary(request, context);
    const json = (await response.json()) as {
      owners: Array<{
        ownerEmail: string;
        totalCents: number;
        dealCount: number;
        byStage: Record<string, { totalCents: number; dealCount: number }>;
      }>;
    };
    const alice = json.owners.find((o) => o.ownerEmail === "alice@example.com");
    expect(alice).toBeDefined();
    expect(alice!.dealCount).toBe(2);
    expect(alice!.totalCents).toBe(125_000);
    expect(alice!.byStage.qualified.totalCents).toBe(50_000);
    expect(alice!.byStage.proposal.totalCents).toBe(75_000);
  });

  it("filters to a single owner when ownerEmail is provided", async () => {
    const a = await seedAccount(tenantId, "x", "A");
    await seedDeal(tenantId, a.id, "alice@example.com", "qualified", 50_000);
    await seedDeal(tenantId, a.id, "bob@example.com", "qualified", 30_000);

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/pipeline-summary-by-owner",
      method: "POST",
      body: { ownerEmail: "alice@example.com" },
      tenantId,
    });
    const response = await pipelineSummary(request, context);
    const json = (await response.json()) as {
      owners: Array<{ ownerEmail: string }>;
    };
    expect(json.owners).toHaveLength(1);
    expect(json.owners[0].ownerEmail).toBe("alice@example.com");
  });

  it("returns empty owners when no open deals", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/pipeline-summary-by-owner",
      method: "POST",
      body: {},
      tenantId,
    });
    const response = await pipelineSummary(request, context);
    const json = (await response.json()) as { owners: unknown[] };
    expect(json.owners).toEqual([]);
  });

  it("isolates deals to caller's tenant", async () => {
    const a = await seedAccount(tenantId, "x", "A");
    await seedDeal(tenantId, a.id, "alice@example.com", "qualified", 50_000);
    const b = await seedAccount("tenant-b", "y", "B");
    await seedDeal("tenant-b", b.id, "rival@b.com", "qualified", 999_999);

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/pipeline-summary-by-owner",
      method: "POST",
      body: {},
      tenantId,
    });
    const response = await pipelineSummary(request, context);
    const json = (await response.json()) as {
      owners: Array<{ ownerEmail: string; totalCents: number }>;
    };
    expect(json.owners.every((o) => o.ownerEmail !== "rival@b.com")).toBe(true);
    expect(json.owners.find((o) => o.ownerEmail === "alice@example.com")!
      .totalCents).toBe(50_000);
  });
});

describe("handlers/log-activity (Resend fan-out)", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "crm@example.com";
    await clearAll(tenantId);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    await clearAll(tenantId);
  });

  it("sends email via Resend when sendEmail=true and kind=email", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "msg_x" }), { status: 200 }),
      );

    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: "https://kit.test/activities",
      method: "POST",
      body: {
        kind: "email",
        subject: "Follow up",
        body: "Thanks for the chat",
        ownerEmail: "rep@example.com",
        sendEmail: true,
        toEmail: "alice@acme.com",
      },
      tenantId,
    });

    const response = await logActivity(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as { resendId?: string };
    expect(json.resendId).toBe("msg_x");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.resend.com/emails");
  });

  it("does not call Resend when sendEmail is false (drafts-only)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: "https://kit.test/activities",
      method: "POST",
      body: {
        kind: "email",
        subject: "Draft",
        body: "Not yet sent",
        ownerEmail: "rep@example.com",
      },
      tenantId,
    });

    const response = await logActivity(request, context);
    expect(response.status).toBe(201);
    const json = (await response.json()) as { resendId?: string };
    expect(json.resendId).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call Resend when kind is not email", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: "https://kit.test/activities",
      method: "POST",
      body: {
        kind: "call",
        subject: "Discovery call",
        body: "Notes",
        ownerEmail: "rep@example.com",
        sendEmail: true,
        toEmail: "alice@acme.com",
      },
      tenantId,
    });

    const response = await logActivity(request, context);
    expect(response.status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when sendEmail=true but toEmail is missing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ tenantId });
    const request = makeRequest({
      url: "https://kit.test/activities",
      method: "POST",
      body: {
        kind: "email",
        subject: "x",
        body: "y",
        ownerEmail: "rep@example.com",
        sendEmail: true,
      },
      tenantId,
    });
    const response = await logActivity(request, context);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
