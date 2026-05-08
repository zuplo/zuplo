import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import findDropOffStep from "../modules/mcp-tools/find-drop-off-step.ts";
import defineFunnelFromQuestion from "../modules/mcp-tools/define-funnel-from-question.ts";
import compareCohorts from "../modules/mcp-tools/compare-cohorts.ts";
import computeFunnel from "../modules/handlers/compute-funnel.ts";
import {
  cohortRepository,
  eventRepository,
  funnelRepository,
  sessionRepository,
  userRepository,
  type Cohort,
  type Event,
  type Funnel,
  type Session,
  type User,
} from "../modules/repositories/events.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

const routes = {
  "POST /compute-funnel": computeFunnel,
};

async function clearAll(tenants = ["tenant-a", "tenant-b"]) {
  for (const t of tenants) {
    for (const repo of [
      eventRepository,
      userRepository,
      sessionRepository,
      funnelRepository,
      cohortRepository,
    ]) {
      const page = await repo.list(t, { limit: 200 });
      for (const i of page.items) await repo.delete(t, i.id);
    }
  }
}

async function seedFunnel(
  tenantId: string,
  overrides: Partial<Omit<Funnel, "id" | "tenantId">> = {},
): Promise<Funnel> {
  return funnelRepository.create(tenantId, {
    slug: overrides.slug ?? "signup_v1",
    name: overrides.name ?? "Signup v1",
    steps: overrides.steps ?? [
      { eventName: "view_pricing", filters: {} },
      { eventName: "click_signup", filters: {} },
      { eventName: "complete_signup", filters: {} },
    ],
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  });
}

async function seedEvent(
  tenantId: string,
  data: Partial<Omit<Event, "id" | "tenantId">> & {
    userId: string;
    name: string;
    occurredAt: string;
  },
): Promise<Event> {
  return eventRepository.create(tenantId, {
    userId: data.userId,
    name: data.name,
    properties: data.properties ?? {},
    occurredAt: data.occurredAt,
    sessionId: data.sessionId ?? null,
    deviceId: null,
    ip: null,
    createdAt: data.createdAt ?? data.occurredAt,
  });
}

async function seedUser(
  tenantId: string,
  data: Partial<Omit<User, "id" | "tenantId">> = {},
): Promise<User> {
  return userRepository.create(tenantId, {
    anonId: data.anonId ?? `anon_${Math.random()}`,
    identifiedEmail: data.identifiedEmail ?? null,
    firstSeenAt: data.firstSeenAt ?? "2024-01-01T00:00:00Z",
    lastSeenAt: data.lastSeenAt ?? "2024-01-02T00:00:00Z",
    traits: data.traits ?? {},
    createdAt: data.createdAt ?? "2024-01-01T00:00:00Z",
  });
}

async function seedSession(
  tenantId: string,
  data: { userId: string; startedAt?: string; endedAt?: string | null },
): Promise<Session> {
  return sessionRepository.create(tenantId, {
    userId: data.userId,
    startedAt: data.startedAt ?? "2024-01-01T00:00:00Z",
    endedAt: data.endedAt ?? null,
    eventCount: 1,
    deviceId: null,
    source: null,
    createdAt: "2024-01-01T00:00:00Z",
  });
}

async function seedCohort(
  tenantId: string,
  overrides: Partial<Omit<Cohort, "id" | "tenantId">> & { slug: string; criteria: Record<string, unknown> },
): Promise<Cohort> {
  return cohortRepository.create(tenantId, {
    slug: overrides.slug,
    name: overrides.name ?? overrides.slug,
    criteria: overrides.criteria,
    userCount: overrides.userCount ?? 0,
    computedAt: overrides.computedAt ?? null,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// find_drop_off_step
// ---------------------------------------------------------------------------

describe("orchestrators/find_drop_off_step", () => {
  beforeEach(async () => {
    await clearAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("DB_PROVIDER");
    clearEnv("CLICKHOUSE_URL");
  });

  it("happy path: identifies the worst step from compute_funnel output", async () => {
    await seedFunnel("tenant-a", { slug: "f1" });
    // Two users — both view_pricing. Only one clicks signup. Neither completes.
    const now = Date.now();
    const isoMinus = (mins: number) =>
      new Date(now - mins * 60_000).toISOString();
    await seedEvent("tenant-a", { userId: "u1", name: "view_pricing", occurredAt: isoMinus(60) });
    await seedEvent("tenant-a", { userId: "u1", name: "click_signup", occurredAt: isoMinus(50) });
    await seedEvent("tenant-a", { userId: "u2", name: "view_pricing", occurredAt: isoMinus(40) });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/find-drop-off-step",
      method: "POST",
      body: { funnelSlug: "f1", daysBack: 1 },
      tenantId: "tenant-a",
    });
    const res = await findDropOffStep(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      worstStep: { eventName: string } | null;
      stepsAnalyzed: number;
      allSteps: Array<{ eventName: string; count: number }>;
    };
    expect(json.worstStep?.eventName).toBe("complete_signup");
    expect(json.stepsAnalyzed).toBe(2);
    expect(json.allSteps).toHaveLength(3);
  });

  it("returns 400 when funnelSlug is missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/find-drop-off-step",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await findDropOffStep(request, context);
    expect(res.status).toBe(400);
  });

  it("multi-tenant isolation: tenant-a's lookup ignores tenant-b funnels", async () => {
    await seedFunnel("tenant-b", { slug: "f1" });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/find-drop-off-step",
      method: "POST",
      body: { funnelSlug: "f1" },
      tenantId: "tenant-a",
    });
    // compute-funnel returns 404; invokeJson throws.
    await expect(findDropOffStep(request, context)).rejects.toThrow(
      /Internal route .* failed: 404/,
    );
  });
});

// ---------------------------------------------------------------------------
// define_funnel_from_question
// ---------------------------------------------------------------------------

describe("orchestrators/define_funnel_from_question", () => {
  beforeEach(async () => {
    await clearAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("DB_PROVIDER");
    clearEnv("CLICKHOUSE_URL");
    clearEnv("CLICKHOUSE_PASSWORD");
    clearEnv("POSTHOG_PERSONAL_API_KEY");
    clearEnv("POSTHOG_PROJECT_ID");
  });

  it("happy path with caller-supplied candidates: token-overlaps and ranks", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/define-funnel-from-question",
      method: "POST",
      body: {
        question: "How many users completed signup after viewing pricing?",
        candidateEvents: [
          "view_pricing",
          "click_signup",
          "complete_signup",
          "open_help_center",
        ],
      },
      tenantId: "tenant-a",
    });
    const res = await defineFunnelFromQuestion(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      proposedSteps: Array<{ eventName: string; matchedTokens: string[] }>;
      discoverySource: string;
    };
    expect(json.discoverySource).toBe("caller");
    const names = json.proposedSteps.map((s) => s.eventName);
    expect(names).toContain("view_pricing");
    expect(names).toContain("complete_signup");
    expect(names).not.toContain("open_help_center");
  });

  it("returns no_candidates error when no candidates passed and no source configured", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/define-funnel-from-question",
      method: "POST",
      body: { question: "What about signups?" },
      tenantId: "tenant-a",
    });
    const res = await defineFunnelFromQuestion(request, context);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { type: string } };
    expect(json.error.type).toBe("no_candidates");
  });

  it("discovers candidates from PostHog when configured", async () => {
    setEnv("POSTHOG_PERSONAL_API_KEY", "phx_test");
    setEnv("POSTHOG_PROJECT_ID", "1");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            ["view_signup", 100],
            ["click_signup", 80],
            ["unrelated_thing", 50],
          ],
          columns: ["event", "volume"],
        }),
        { status: 200 },
      ),
    );

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/define-funnel-from-question",
      method: "POST",
      body: { question: "signup flow analysis" },
      tenantId: "tenant-a",
    });
    const res = await defineFunnelFromQuestion(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      discoverySource: string;
      proposedSteps: Array<{ eventName: string }>;
    };
    expect(json.discoverySource).toBe("posthog");
    expect(json.proposedSteps.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when question is missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/define-funnel-from-question",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await defineFunnelFromQuestion(request, context);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// compare_cohorts
// ---------------------------------------------------------------------------

describe("orchestrators/compare_cohorts", () => {
  beforeEach(async () => {
    await clearAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: compares mean event counts between two cohorts", async () => {
    // Cohort A: pro plan users; Cohort B: free plan users.
    const userA1 = await seedUser("tenant-a", { traits: { plan: "pro" } });
    const userA2 = await seedUser("tenant-a", { traits: { plan: "pro" } });
    const userB1 = await seedUser("tenant-a", { traits: { plan: "free" } });

    await seedCohort("tenant-a", { slug: "pro", criteria: { plan: "pro" } });
    await seedCohort("tenant-a", { slug: "free", criteria: { plan: "free" } });

    // 4 events for pro users (2 each), 1 for free
    for (const u of [userA1, userA2]) {
      await seedEvent("tenant-a", { userId: u.id, name: "page_view", occurredAt: "2024-01-01T00:00:00Z" });
      await seedEvent("tenant-a", { userId: u.id, name: "click", occurredAt: "2024-01-01T00:00:01Z" });
    }
    await seedEvent("tenant-a", { userId: userB1.id, name: "page_view", occurredAt: "2024-01-01T00:00:00Z" });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/compare-cohorts",
      method: "POST",
      body: { cohortSlugA: "pro", cohortSlugB: "free", metric: "event_count" },
      tenantId: "tenant-a",
    });
    const res = await compareCohorts(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      cohortA: { userCount: number; mean: number };
      cohortB: { userCount: number; mean: number };
      delta: number;
    };
    expect(json.cohortA.userCount).toBe(2);
    expect(json.cohortB.userCount).toBe(1);
    expect(json.cohortA.mean).toBe(2);
    expect(json.cohortB.mean).toBe(1);
    expect(json.delta).toBe(1);
  });

  it("session_count metric uses session repo", async () => {
    const u = await seedUser("tenant-a", { traits: { plan: "pro" } });
    const u2 = await seedUser("tenant-a", { traits: { plan: "free" } });
    await seedCohort("tenant-a", { slug: "pro", criteria: { plan: "pro" } });
    await seedCohort("tenant-a", { slug: "free", criteria: { plan: "free" } });
    await seedSession("tenant-a", { userId: u.id });
    await seedSession("tenant-a", { userId: u.id });
    await seedSession("tenant-a", { userId: u2.id });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/compare-cohorts",
      method: "POST",
      body: {
        cohortSlugA: "pro",
        cohortSlugB: "free",
        metric: "session_count",
      },
      tenantId: "tenant-a",
    });
    const res = await compareCohorts(request, context);
    const json = (await res.json()) as {
      cohortA: { mean: number };
      cohortB: { mean: number };
    };
    expect(json.cohortA.mean).toBe(2);
    expect(json.cohortB.mean).toBe(1);
  });

  it("returns 404 when a cohort is missing", async () => {
    await seedCohort("tenant-a", { slug: "pro", criteria: {} });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/compare-cohorts",
      method: "POST",
      body: {
        cohortSlugA: "pro",
        cohortSlugB: "missing",
        metric: "event_count",
      },
      tenantId: "tenant-a",
    });
    const res = await compareCohorts(request, context);
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid metric", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/compare-cohorts",
      method: "POST",
      body: {
        cohortSlugA: "x",
        cohortSlugB: "y",
        metric: "nonsense",
      },
      tenantId: "tenant-a",
    });
    const res = await compareCohorts(request, context);
    expect(res.status).toBe(400);
  });

  it("multi-tenant isolation: cohort lookup is scoped to caller's tenant", async () => {
    await seedCohort("tenant-b", { slug: "pro", criteria: {} });
    await seedCohort("tenant-b", { slug: "free", criteria: {} });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/compare-cohorts",
      method: "POST",
      body: {
        cohortSlugA: "pro",
        cohortSlugB: "free",
        metric: "event_count",
      },
      tenantId: "tenant-a",
    });
    const res = await compareCohorts(request, context);
    expect(res.status).toBe(404);
  });
});
