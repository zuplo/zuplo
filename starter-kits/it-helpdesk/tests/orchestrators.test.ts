import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import {
  ticketRepository,
  kbArticleRepository,
  categoryRepository,
} from "../modules/repositories/tickets.ts";
import triageTicketHandler from "../modules/mcp-tools/triage-ticket.ts";
import escalateBreachingSlaHandler from "../modules/mcp-tools/escalate-breaching-sla.ts";
import suggestKbAnswerHandler from "../modules/mcp-tools/suggest-kb-answer.ts";
import getTicketHandler from "../modules/handlers/get-ticket.ts";
import listTicketsHandler from "../modules/handlers/list-tickets.ts";
import searchKbHandler from "../modules/handlers/search-kb.ts";

const ENV_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "AI_GATEWAY_URL"];
function clearEnv() {
  for (const key of ENV_KEYS) {
    delete (environment as Record<string, string | undefined>)[key];
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  clearEnv();
  for (const tenant of ["tenant-a", "tenant-b"]) {
    for (const repo of [ticketRepository, kbArticleRepository, categoryRepository]) {
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
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("orchestrator triage_ticket", () => {
  it("classifies via Claude and resolves assignee from category map", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    const tenant = "tenant-a";
    const ticket = await ticketRepository.create(tenant, {
      requesterEmail: "alice@example.com",
      subject: "Laptop won't boot",
      body: "It bricked after restart",
      category: "other",
      priority: "med",
      status: "new",
      assigneeEmail: null,
      slaBreachAt: null,
      openedAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: null,
      tags: [],
    });
    await categoryRepository.create(tenant, {
      slug: "hardware",
      name: "Hardware",
      defaultAssigneeEmail: "deviceops@example.com",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      claudeMock({
        category: "hardware",
        priority: "high",
        reasoning: "Laptop down",
      }),
    );

    const { context, invokeCalls } = makeContext({
      routes: { "GET /tickets/:id": getTicketHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/triage-ticket",
      method: "POST",
      body: { ticketId: ticket.id },
      tenantId: tenant,
    });
    const response = await triageTicketHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.suggestedCategory).toBe("hardware");
    expect(data.suggestedPriority).toBe("high");
    expect(data.suggestedAssignee).toBe("deviceops@example.com");
    expect(invokeCalls.some((c) => c.path.includes("/tickets/"))).toBe(true);
  });

  it("returns null assignee when no category match", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    const tenant = "tenant-a";
    const ticket = await ticketRepository.create(tenant, {
      requesterEmail: "x@example.com",
      subject: "Help",
      body: "Help",
      category: "other",
      priority: "med",
      status: "new",
      assigneeEmail: null,
      slaBreachAt: null,
      openedAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: null,
      tags: [],
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      claudeMock({
        category: "network",
        priority: "low",
        reasoning: "x",
      }),
    );
    const { context } = makeContext({
      routes: { "GET /tickets/:id": getTicketHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/triage-ticket",
      method: "POST",
      body: { ticketId: ticket.id },
      tenantId: tenant,
    });
    const response = await triageTicketHandler(request, context);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.suggestedAssignee).toBeNull();
  });

  it("returns 400 without ticketId", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/triage-ticket",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const response = await triageTicketHandler(request, context);
    expect(response.status).toBe(400);
  });
});

describe("orchestrator escalate_breaching_sla", () => {
  it("returns open tickets within minutesBefore window", async () => {
    const tenant = "tenant-a";
    const breachSoon = new Date(Date.now() + 5 * 60_000).toISOString();
    const breachLater = new Date(Date.now() + 6 * 60 * 60_000).toISOString();

    await ticketRepository.create(tenant, {
      requesterEmail: "1@x.com",
      subject: "open soon",
      body: "x",
      category: "other",
      priority: "high",
      status: "new",
      assigneeEmail: null,
      slaBreachAt: breachSoon,
      openedAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: null,
      tags: [],
    });
    await ticketRepository.create(tenant, {
      requesterEmail: "2@x.com",
      subject: "later",
      body: "x",
      category: "other",
      priority: "high",
      status: "in_progress",
      assigneeEmail: null,
      slaBreachAt: breachLater,
      openedAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: null,
      tags: [],
    });
    // Resolved tickets shouldn't be flagged.
    await ticketRepository.create(tenant, {
      requesterEmail: "3@x.com",
      subject: "resolved",
      body: "x",
      category: "other",
      priority: "high",
      status: "resolved",
      assigneeEmail: null,
      slaBreachAt: breachSoon,
      openedAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: "2026-05-01T01:00:00.000Z",
      tags: [],
    });

    const { context } = makeContext({
      routes: { "GET /tickets": listTicketsHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/escalate-breaching-sla",
      method: "POST",
      body: { minutesBefore: 30 },
      tenantId: tenant,
    });
    const response = await escalateBreachingSlaHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { count: number; tickets: Array<{ subject: string }> };
    expect(data.count).toBe(1);
    expect(data.tickets[0]?.subject).toBe("open soon");
  });

  it("returns no-op count when nothing breaching", async () => {
    const tenant = "tenant-a";
    const { context } = makeContext({
      routes: { "GET /tickets": listTicketsHandler },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/escalate-breaching-sla",
      method: "POST",
      body: {},
      tenantId: tenant,
    });
    const response = await escalateBreachingSlaHandler(request, context);
    const data = (await response.json()) as { count: number };
    expect(data.count).toBe(0);
  });

  it("respects multi-tenant isolation", async () => {
    const breachSoon = new Date(Date.now() + 5 * 60_000).toISOString();
    await ticketRepository.create("tenant-a", {
      requesterEmail: "1@x.com",
      subject: "tenant a",
      body: "x",
      category: "other",
      priority: "high",
      status: "new",
      assigneeEmail: null,
      slaBreachAt: breachSoon,
      openedAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: null,
      tags: [],
    });
    await ticketRepository.create("tenant-b", {
      requesterEmail: "2@x.com",
      subject: "tenant b",
      body: "x",
      category: "other",
      priority: "high",
      status: "new",
      assigneeEmail: null,
      slaBreachAt: breachSoon,
      openedAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: null,
      tags: [],
    });
    const { context } = makeContext({
      routes: { "GET /tickets": listTicketsHandler },
      tenantId: "tenant-a",
    });
    const request = makeRequest({
      url: "https://kit.test/escalate-breaching-sla",
      method: "POST",
      body: { minutesBefore: 30 },
      tenantId: "tenant-a",
    });
    const response = await escalateBreachingSlaHandler(request, context);
    const data = (await response.json()) as {
      count: number;
      tickets: Array<{ subject: string }>;
    };
    expect(data.count).toBe(1);
    expect(data.tickets[0].subject).toBe("tenant a");
  });
});

describe("orchestrator suggest_kb_answer", () => {
  it("retrieves candidates then asks Claude to rank", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    const tenant = "tenant-a";
    const ticket = await ticketRepository.create(tenant, {
      requesterEmail: "alice@example.com",
      subject: "VPN connection failing",
      body: "Cannot connect to VPN office",
      category: "network",
      priority: "med",
      status: "new",
      assigneeEmail: null,
      slaBreachAt: null,
      openedAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: null,
      tags: [],
    });
    const article = await kbArticleRepository.create(tenant, {
      title: "VPN setup",
      body: "Restart your VPN client and reconnect",
      tags: ["vpn"],
      category: "network",
      helpfulCount: 0,
      lastUpdatedAt: "2026-05-01T00:00:00.000Z",
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      claudeMock({
        bestArticleIds: [article.id],
        draftAnswer: "Try restarting your VPN client.",
        confidence: "high",
      }),
    );

    const { context } = makeContext({
      routes: {
        "GET /tickets/:id": getTicketHandler,
        "GET /kb-articles/search": searchKbHandler,
      },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/suggest-kb-answer",
      method: "POST",
      body: { ticketId: ticket.id },
      tenantId: tenant,
    });
    const response = await suggestKbAnswerHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      suggestions: Array<{ id: string }>;
      draftAnswer: string;
      confidence: string;
    };
    expect(data.confidence).toBe("high");
    expect(data.suggestions[0]?.id).toBe(article.id);
    expect(data.draftAnswer).toContain("VPN");
  });

  it("returns empty suggestions with low confidence when no KB matches", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    const tenant = "tenant-a";
    const ticket = await ticketRepository.create(tenant, {
      requesterEmail: "alice@example.com",
      subject: "totally unrelated topic",
      body: "garbledygook",
      category: "other",
      priority: "med",
      status: "new",
      assigneeEmail: null,
      slaBreachAt: null,
      openedAt: "2026-05-01T00:00:00.000Z",
      resolvedAt: null,
      tags: [],
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");

    const { context } = makeContext({
      routes: {
        "GET /tickets/:id": getTicketHandler,
        "GET /kb-articles/search": searchKbHandler,
      },
      tenantId: tenant,
    });
    const request = makeRequest({
      url: "https://kit.test/suggest-kb-answer",
      method: "POST",
      body: { ticketId: ticket.id },
      tenantId: tenant,
    });
    const response = await suggestKbAnswerHandler(request, context);
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      confidence: string;
      suggestions: unknown[];
    };
    expect(data.confidence).toBe("low");
    expect(data.suggestions).toEqual([]);
    // Claude was NOT called because no candidates.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 without ticketId", async () => {
    environment.ANTHROPIC_API_KEY = "sk-test";
    const { context } = makeContext({ routes: {}, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/suggest-kb-answer",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const response = await suggestKbAnswerHandler(request, context);
    expect(response.status).toBe(400);
  });
});
