import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import {
  ticketRepository,
  conversationRepository,
  customerRepository,
} from "../modules/repositories/tickets.ts";
import triageIncomingTicketHandler from "../modules/mcp-tools/triage-incoming-ticket.ts";
import escalateWithSummaryHandler from "../modules/mcp-tools/escalate-with-summary.ts";
import summarizeRecurringIssuesHandler from "../modules/mcp-tools/summarize-recurring-issues.ts";
import getTicketHandler from "../modules/handlers/get-ticket.ts";
import listTicketsHandler from "../modules/handlers/list-tickets.ts";

const ENV_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "AI_GATEWAY_URL"];
function clearEnv() {
  for (const key of ENV_KEYS) {
    delete (environment as Record<string, string | undefined>)[key];
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  clearEnv();
  // Wipe the in-memory repos by listing+deleting per tenant.
  for (const tenant of ["tenant-a", "tenant-b"]) {
    for (const repo of [
      ticketRepository,
      conversationRepository,
      customerRepository,
    ]) {
      const page = await repo.list(tenant, { limit: 1000 });
      for (const item of page.items) {
        await repo.delete(tenant, item.id).catch(() => {});
      }
    }
  }
});

function claudeMock(jsonOut: unknown) {
  return new Response(
    JSON.stringify({
      id: "msg_1",
      model: "claude-sonnet-4-5",
      role: "assistant",
      content: [{ type: "text", text: JSON.stringify(jsonOut) }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("orchestrator triage_incoming_ticket", () => {
  it("calls Claude with ticket details and returns suggested triage data", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";

    const tenant = "tenant-a";
    const now = "2026-05-01T00:00:00.000Z";
    // Seed a ticket and a recent ticket with assignee for the tag-correlation logic.
    const ticket = await ticketRepository.create(tenant, {
      customerEmail: "a@example.com",
      subject: "Login broken",
      body: "I can't sign in",
      status: "new",
      priority: "normal",
      channel: "email",
      assigneeEmail: null,
      tags: [],
      slaBreachAt: null,
      openedAt: now,
      resolvedAt: null,
      createdAt: now,
    });
    await ticketRepository.create(tenant, {
      customerEmail: "b@example.com",
      subject: "Old ticket",
      body: "...",
      status: "resolved",
      priority: "normal",
      channel: "email",
      assigneeEmail: "agent@example.com",
      tags: ["auth"],
      slaBreachAt: null,
      openedAt: now,
      resolvedAt: now,
      createdAt: now,
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      claudeMock({
        category: "auth",
        tags: ["auth"],
        priority: "high",
        reasoning: "Login broken → can't work",
      }),
    );

    const { context, invokeCalls } = makeContext({
      routes: {
        "GET /tickets/:id": getTicketHandler,
        "GET /tickets": listTicketsHandler,
      },
      tenantId: tenant,
    });

    const request = makeRequest({
      url: "https://kit.test/triage-incoming-ticket",
      method: "POST",
      body: { ticketId: ticket.id, draftReply: false },
      tenantId: tenant,
    });

    const response = await triageIncomingTicketHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.ticketId).toBe(ticket.id);
    expect(data.category).toBe("auth");
    expect(data.suggestedTags).toEqual(["auth"]);
    expect(data.suggestedPriority).toBe("high");
    expect(data.suggestedAssignee).toBe("agent@example.com");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(invokeCalls.some((c) => c.path.includes("/tickets/"))).toBe(true);
    expect(invokeCalls.some((c) => c.path.startsWith("/tickets?"))).toBe(true);
  });

  it("returns 400 without ticketId", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/triage-incoming-ticket",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const response = await triageIncomingTicketHandler(request, context);
    expect(response.status).toBe(400);
  });

  it("isolates tenants — orchestrator only sees its own tenant's tickets", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    const ticketA = await ticketRepository.create("tenant-a", {
      customerEmail: "a@a.com",
      subject: "S",
      body: "B",
      status: "new",
      priority: "normal",
      channel: "email",
      assigneeEmail: null,
      tags: [],
      slaBreachAt: null,
      openedAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: null,
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    // Tenant B has a similar ticket whose assignee should NOT appear.
    await ticketRepository.create("tenant-b", {
      customerEmail: "x@x.com",
      subject: "S",
      body: "B",
      status: "resolved",
      priority: "normal",
      channel: "email",
      assigneeEmail: "tenantBagent@example.com",
      tags: ["auth"],
      slaBreachAt: null,
      openedAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: "2026-05-01T00:00:00.000Z",
      createdAt: "2026-05-01T00:00:00.000Z",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      claudeMock({
        category: "auth",
        tags: ["auth"],
        priority: "high",
        reasoning: "x",
      }),
    );

    const { context } = makeContext({
      routes: {
        "GET /tickets/:id": getTicketHandler,
        "GET /tickets": listTicketsHandler,
      },
      tenantId: "tenant-a",
    });

    const request = makeRequest({
      url: "https://kit.test/triage-incoming-ticket",
      method: "POST",
      body: { ticketId: ticketA.id },
      tenantId: "tenant-a",
    });
    const response = await triageIncomingTicketHandler(request, context);
    const data = (await response.json()) as Record<string, unknown>;
    // Tenant A has no assignees with `auth` tag, so no suggested assignee.
    expect(data.suggestedAssignee).toBeNull();
  });
});

describe("orchestrator escalate_with_summary", () => {
  it("builds a chronological summary from ticket + conversations + customer", async () => {
    const tenant = "tenant-a";
    const now = "2026-05-01T00:00:00.000Z";
    const customer = await customerRepository.create(tenant, {
      email: "alice@example.com",
      name: "Alice",
      plan: "pro",
      accountId: "acc1",
      createdAt: now,
    });
    const ticket = await ticketRepository.create(tenant, {
      customerEmail: customer.email,
      subject: "Help",
      body: "Please help",
      status: "open",
      priority: "high",
      channel: "email",
      assigneeEmail: null,
      tags: ["billing"],
      slaBreachAt: null,
      openedAt: now,
      resolvedAt: null,
      createdAt: now,
    });
    await conversationRepository.create(tenant, {
      ticketId: ticket.id,
      kind: "public",
      authorEmail: "agent@example.com",
      body: "Got it",
      sentAt: "2026-05-01T01:00:00.000Z",
      createdAt: "2026-05-01T01:00:00.000Z",
    });
    await conversationRepository.create(tenant, {
      ticketId: ticket.id,
      kind: "internal",
      authorEmail: "manager@example.com",
      body: "Internal note",
      sentAt: "2026-05-01T02:00:00.000Z",
      createdAt: "2026-05-01T02:00:00.000Z",
    });

    const { context } = makeContext({
      routes: {
        "GET /tickets/:id": getTicketHandler,
      },
      tenantId: tenant,
    });

    const request = makeRequest({
      url: "https://kit.test/escalate-with-summary",
      method: "POST",
      body: { ticketId: ticket.id },
      tenantId: tenant,
    });
    const response = await escalateWithSummaryHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.ticketId).toBe(ticket.id);
    expect(data.conversationCount).toBe(2);
    expect((data.summaryText as string)).toContain("Alice");
    expect((data.summaryText as string)).toContain("[internal]");
  });

  it("returns 400 without ticketId", async () => {
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/escalate-with-summary",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const response = await escalateWithSummaryHandler(request, context);
    expect(response.status).toBe(400);
  });

  it("handles ticket with no customer record gracefully", async () => {
    const tenant = "tenant-a";
    const now = "2026-05-01T00:00:00.000Z";
    const ticket = await ticketRepository.create(tenant, {
      customerEmail: "stranger@nowhere.com",
      subject: "Hi",
      body: "Hi",
      status: "new",
      priority: "normal",
      channel: "email",
      assigneeEmail: null,
      tags: [],
      slaBreachAt: null,
      openedAt: now,
      resolvedAt: null,
      createdAt: now,
    });
    const { context } = makeContext({
      routes: { "GET /tickets/:id": getTicketHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/escalate-with-summary",
      method: "POST",
      body: { ticketId: ticket.id },
      tenantId: tenant,
    });
    const response = await escalateWithSummaryHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.customer).toBeNull();
    expect(data.conversationCount).toBe(0);
  });
});

describe("orchestrator summarize_recurring_issues", () => {
  it("groups tickets by tag and returns top issues", async () => {
    const tenant = "tenant-a";
    const recent = new Date(Date.now() - 1000).toISOString();

    for (let i = 0; i < 3; i++) {
      await ticketRepository.create(tenant, {
        customerEmail: `${i}@x.com`,
        subject: `Login issue ${i}`,
        body: "x",
        status: "new",
        priority: "normal",
        channel: "email",
        assigneeEmail: null,
        tags: ["auth"],
        slaBreachAt: null,
        openedAt: recent,
        resolvedAt: null,
        createdAt: recent,
      });
    }
    await ticketRepository.create(tenant, {
      customerEmail: "billing@x.com",
      subject: "Billing q",
      body: "x",
      status: "new",
      priority: "normal",
      channel: "email",
      assigneeEmail: null,
      tags: ["billing"],
      slaBreachAt: null,
      openedAt: recent,
      resolvedAt: null,
      createdAt: recent,
    });

    const { context } = makeContext({
      routes: { "GET /tickets": listTicketsHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/summarize-recurring-issues",
      method: "POST",
      body: { topN: 5 },
      tenantId: tenant,
    });
    const response = await summarizeRecurringIssuesHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { topIssues: Array<{ tag: string; count: number }> };
    const auth = data.topIssues.find((t) => t.tag === "auth");
    const billing = data.topIssues.find((t) => t.tag === "billing");
    expect(auth?.count).toBe(3);
    expect(billing?.count).toBe(1);
  });

  it("returns no-op gracefully when nothing in window", async () => {
    const tenant = "tenant-a";
    const old = new Date(Date.now() - 365 * 86400000).toISOString();
    await ticketRepository.create(tenant, {
      customerEmail: "old@x.com",
      subject: "Old",
      body: "x",
      status: "resolved",
      priority: "normal",
      channel: "email",
      assigneeEmail: null,
      tags: ["auth"],
      slaBreachAt: null,
      openedAt: old,
      resolvedAt: old,
      createdAt: old,
    });
    const { context } = makeContext({
      routes: { "GET /tickets": listTicketsHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/summarize-recurring-issues",
      method: "POST",
      body: { daysBack: 7 },
      tenantId: tenant,
    });
    const response = await summarizeRecurringIssuesHandler(request, context);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.ticketsConsidered).toBe(0);
    expect((data.topIssues as unknown[]).length).toBe(0);
  });

  it("respects multi-tenant isolation", async () => {
    const recent = new Date(Date.now() - 1000).toISOString();
    await ticketRepository.create("tenant-a", {
      customerEmail: "a@x.com",
      subject: "A",
      body: "x",
      status: "new",
      priority: "normal",
      channel: "email",
      assigneeEmail: null,
      tags: ["auth"],
      slaBreachAt: null,
      openedAt: recent,
      resolvedAt: null,
      createdAt: recent,
    });
    await ticketRepository.create("tenant-b", {
      customerEmail: "b@x.com",
      subject: "B",
      body: "x",
      status: "new",
      priority: "normal",
      channel: "email",
      assigneeEmail: null,
      tags: ["auth", "billing"],
      slaBreachAt: null,
      openedAt: recent,
      resolvedAt: null,
      createdAt: recent,
    });

    const { context } = makeContext({
      routes: { "GET /tickets": listTicketsHandler },
      tenantId: "tenant-a",
    });
    const request = makeRequest({
      url: "https://kit.test/summarize-recurring-issues",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const response = await summarizeRecurringIssuesHandler(request, context);
    const data = (await response.json()) as { ticketsConsidered: number };
    expect(data.ticketsConsidered).toBe(1);
  });
});
