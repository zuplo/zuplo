import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import matchLeadToAccount from "../modules/mcp-tools/match-lead-to-account.ts";
import routeLeadIntelligently from "../modules/mcp-tools/route-lead-intelligently.ts";
import summarizeUnworkedLeads from "../modules/mcp-tools/summarize-unworked-leads.ts";
import getLead from "../modules/handlers/get-lead.ts";
import listLeads from "../modules/handlers/list-leads.ts";
import listRoutingRules from "../modules/handlers/list-routing-rules.ts";
import assignLead from "../modules/handlers/assign-lead.ts";
import { leadRepository } from "../modules/repositories/leads.ts";
import { routingRuleRepository } from "../modules/repositories/routing-rules.ts";

const routes = {
  "GET /leads": listLeads,
  "GET /leads/:id": getLead,
  "GET /routing-rules": listRoutingRules,
  "PATCH /leads/:id/assign": assignLead,
};

async function clearAll(tenantId: string) {
  for (const repo of [leadRepository, routingRuleRepository]) {
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

async function seedLead(
  tenantId: string,
  email: string,
  opts: Partial<{
    company: string;
    status: "new" | "contacted" | "qualified" | "unqualified" | "converted";
    assignedTo: string | null;
    assignedAt: string | null;
    score: number;
    source: string;
    industry: string;
  }> = {},
) {
  const lead = await leadRepository.create(tenantId, {
    firstName: "First",
    lastName: "Last",
    email,
    company: opts.company ?? "Acme Corp",
    title: "VP",
    phone: "555-0100",
    source: opts.source ?? "web",
    status: opts.status ?? "new",
    assignedTo: opts.assignedTo ?? null,
    assignedAt: opts.assignedAt ?? null,
    score: opts.score ?? 0,
    createdAt: new Date().toISOString(),
  });
  return lead;
}

describe("orchestrators/match-lead-to-account", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });

  it("returns candidates with same domain", async () => {
    const target = await seedLead(tenantId, "alice@acme.com");
    const sibling = await seedLead(tenantId, "bob@acme.com");
    await seedLead(tenantId, "other@elsewhere.com");

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/match-lead-to-account",
      method: "POST",
      body: { leadId: target.id },
      tenantId,
    });
    const response = await matchLeadToAccount(request, context);
    const json = (await response.json()) as {
      candidateCount: number;
      candidates: Array<{ id: string }>;
      domain: string;
    };
    expect(json.domain).toBe("acme.com");
    expect(json.candidateCount).toBe(1);
    expect(json.candidates[0].id).toBe(sibling.id);
  });

  it("returns empty candidates for personal email domains", async () => {
    const target = await seedLead(tenantId, "user@gmail.com");
    await seedLead(tenantId, "another@gmail.com");

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/match-lead-to-account",
      method: "POST",
      body: { leadId: target.id },
      tenantId,
    });
    const response = await matchLeadToAccount(request, context);
    const json = (await response.json()) as {
      candidates: unknown[];
      note: string;
    };
    expect(json.candidates).toEqual([]);
    expect(json.note).toContain("Personal-email");
  });

  it("isolates matches to caller's tenant", async () => {
    const a = await seedLead(tenantId, "alice@acme.com");
    await seedLead("tenant-b", "leak@acme.com");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/match-lead-to-account",
      method: "POST",
      body: { leadId: a.id },
      tenantId,
    });
    const response = await matchLeadToAccount(request, context);
    const json = (await response.json()) as { candidateCount: number };
    expect(json.candidateCount).toBe(0);
  });
});

describe("orchestrators/route-lead-intelligently", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_DEFAULT_CHANNEL = "C123";
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "leads@example.com";
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_DEFAULT_CHANNEL;
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });

  it("assigns lead and notifies Slack and Resend on match", async () => {
    const lead = await seedLead(tenantId, "alice@acme.com", {
      source: "web",
    });
    await routingRuleRepository.create(tenantId, {
      name: "Web → Alice",
      priority: 1,
      conditions: { source: "web" },
      assignTo: "alice@team.com",
      active: true,
    });

    let slackCalls = 0;
    let resendCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://slack.com/api/chat.postMessage")) {
        slackCalls += 1;
        return new Response(
          JSON.stringify({ ok: true, ts: "1.2", channel: "C123" }),
          { status: 200 },
        );
      }
      if (url === "https://api.resend.com/emails") {
        resendCalls += 1;
        return new Response(JSON.stringify({ id: "re_xxx" }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/route-lead-intelligently",
      method: "POST",
      body: { leadId: lead.id, notifySlack: true, notifyEmail: true },
      tenantId,
    });
    const response = await routeLeadIntelligently(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      assigned: boolean;
      assignedTo: string;
      ruleName: string;
      notifications: { slack?: { ok: boolean }; email?: { id?: string } };
    };
    expect(json.assigned).toBe(true);
    expect(json.assignedTo).toBe("alice@team.com");
    expect(json.notifications.slack?.ok).toBe(true);
    expect(json.notifications.email?.id).toBe("re_xxx");
    expect(slackCalls).toBe(1);
    expect(resendCalls).toBe(1);

    const updated = await leadRepository.get(tenantId, lead.id);
    expect(updated?.assignedTo).toBe("alice@team.com");
  });

  it("respects notifySlack=false / notifyEmail=false (drafts only)", async () => {
    const lead = await seedLead(tenantId, "alice@acme.com", {
      source: "web",
    });
    await routingRuleRepository.create(tenantId, {
      name: "Web → Alice",
      priority: 1,
      conditions: { source: "web" },
      assignTo: "alice@team.com",
      active: true,
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/route-lead-intelligently",
      method: "POST",
      body: { leadId: lead.id, notifySlack: false, notifyEmail: false },
      tenantId,
    });
    const response = await routeLeadIntelligently(request, context);
    const json = (await response.json()) as {
      assigned: boolean;
      notifications: object;
    };
    expect(json.assigned).toBe(true);
    expect(Object.keys(json.notifications)).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns assigned=false when no rule matches", async () => {
    const lead = await seedLead(tenantId, "alice@acme.com", {
      source: "trade-show",
    });
    await routingRuleRepository.create(tenantId, {
      name: "Web → Alice",
      priority: 1,
      conditions: { source: "web" },
      assignTo: "alice@team.com",
      active: true,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/route-lead-intelligently",
      method: "POST",
      body: { leadId: lead.id, notifySlack: true },
      tenantId,
    });
    const response = await routeLeadIntelligently(request, context);
    const json = (await response.json()) as {
      assigned: boolean;
      reason: string;
      trace: unknown[];
    };
    expect(json.assigned).toBe(false);
    expect(json.reason).toContain("No active routing rule matched");
    expect(json.trace).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips inactive rules and respects priority order", async () => {
    const lead = await seedLead(tenantId, "alice@acme.com", {
      source: "web",
    });
    // Inactive higher-priority rule (priority 0) — should be skipped.
    await routingRuleRepository.create(tenantId, {
      name: "Inactive",
      priority: 0,
      conditions: { source: "web" },
      assignTo: "wrong@team.com",
      active: false,
    });
    // Active rule with higher priority that doesn't match
    await routingRuleRepository.create(tenantId, {
      name: "Mismatched first",
      priority: 1,
      conditions: { source: "phone" },
      assignTo: "first@team.com",
      active: true,
    });
    // Active rule that matches at lower priority
    await routingRuleRepository.create(tenantId, {
      name: "Match",
      priority: 2,
      conditions: { source: "web" },
      assignTo: "right@team.com",
      active: true,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, ts: "1.0" }),
        { status: 200 },
      ),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/route-lead-intelligently",
      method: "POST",
      body: { leadId: lead.id, notifySlack: false },
      tenantId,
    });
    const response = await routeLeadIntelligently(request, context);
    const json = (await response.json()) as {
      assignedTo: string;
      ruleName: string;
      trace: Array<{ ruleName: string }>;
    };
    expect(json.assignedTo).toBe("right@team.com");
    expect(json.ruleName).toBe("Match");
    // Trace should not include the Inactive rule
    expect(json.trace.find((t) => t.ruleName === "Inactive")).toBeUndefined();
  });

  it("isolates routing rules to caller's tenant", async () => {
    const lead = await seedLead(tenantId, "alice@acme.com", {
      source: "web",
    });
    // Tenant-b rule should NOT be evaluated.
    await routingRuleRepository.create("tenant-b", {
      name: "Wrong tenant",
      priority: 0,
      conditions: { source: "web" },
      assignTo: "wrong@b.com",
      active: true,
    });
    await routingRuleRepository.create(tenantId, {
      name: "Right",
      priority: 1,
      conditions: { source: "web" },
      assignTo: "right@a.com",
      active: true,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ts: "1.0" }), { status: 200 }),
    );
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/route-lead-intelligently",
      method: "POST",
      body: { leadId: lead.id, notifySlack: false },
      tenantId,
    });
    const response = await routeLeadIntelligently(request, context);
    const json = (await response.json()) as { assignedTo: string };
    expect(json.assignedTo).toBe("right@a.com");
  });
});

describe("orchestrators/summarize-unworked-leads", () => {
  const tenantId = "tenant-a";
  beforeEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });
  afterEach(async () => {
    await clearAll(tenantId);
    await clearAll("tenant-b");
  });

  it("groups stale leads by owner and respects threshold", async () => {
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    const recent = new Date(Date.now() - 1 * 86400000).toISOString();
    await seedLead(tenantId, "stale1@x.com", {
      status: "new",
      assignedTo: "alice@team.com",
      assignedAt: old,
    });
    await seedLead(tenantId, "stale2@x.com", {
      status: "contacted",
      assignedTo: "alice@team.com",
      assignedAt: old,
    });
    await seedLead(tenantId, "fresh@x.com", {
      status: "new",
      assignedTo: "alice@team.com",
      assignedAt: recent,
    });
    await seedLead(tenantId, "qualified@x.com", {
      status: "qualified",
      assignedTo: "alice@team.com",
      assignedAt: old,
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/summarize-unworked-leads",
      method: "POST",
      body: { daysSince: 7 },
      tenantId,
    });
    const response = await summarizeUnworkedLeads(request, context);
    const json = (await response.json()) as {
      total: number;
      byOwner: Record<string, { count: number }>;
    };
    expect(json.total).toBe(2);
    expect(json.byOwner["alice@team.com"].count).toBe(2);
  });

  it("filters to a single owner when ownerEmail is provided", async () => {
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    await seedLead(tenantId, "alice@x.com", {
      status: "new",
      assignedTo: "alice@team.com",
      assignedAt: old,
    });
    await seedLead(tenantId, "bob@x.com", {
      status: "new",
      assignedTo: "bob@team.com",
      assignedAt: old,
    });

    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/summarize-unworked-leads",
      method: "POST",
      body: { ownerEmail: "alice@team.com" },
      tenantId,
    });
    const response = await summarizeUnworkedLeads(request, context);
    const json = (await response.json()) as {
      total: number;
      byOwner: Record<string, { count: number }>;
    };
    expect(json.total).toBe(1);
    expect(json.byOwner["alice@team.com"].count).toBe(1);
    expect(json.byOwner["bob@team.com"]).toBeUndefined();
  });

  it("returns 0 when no stale leads (no-op)", async () => {
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/summarize-unworked-leads",
      method: "POST",
      body: {},
      tenantId,
    });
    const response = await summarizeUnworkedLeads(request, context);
    const json = (await response.json()) as { total: number; byOwner: object };
    expect(json.total).toBe(0);
    expect(Object.keys(json.byOwner)).toHaveLength(0);
  });

  it("isolates results to caller's tenant", async () => {
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    await seedLead(tenantId, "stale@a.com", {
      status: "new",
      assignedTo: "owner@a.com",
      assignedAt: old,
    });
    await seedLead("tenant-b", "stale@b.com", {
      status: "new",
      assignedTo: "owner@b.com",
      assignedAt: old,
    });
    const { context } = makeContext({ routes, tenantId });
    const request = makeRequest({
      url: "https://kit.test/summarize-unworked-leads",
      method: "POST",
      body: {},
      tenantId,
    });
    const response = await summarizeUnworkedLeads(request, context);
    const json = (await response.json()) as {
      total: number;
      byOwner: Record<string, unknown>;
    };
    expect(json.total).toBe(1);
    expect(json.byOwner["owner@b.com"]).toBeUndefined();
  });
});
