import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import interpretResults from "../modules/mcp-tools/interpret-results.ts";
import killUnderperformingVariant from "../modules/mcp-tools/kill-underperforming-variant.ts";
import proposeExperimentForMetric from "../modules/mcp-tools/propose-experiment-for-metric.ts";
import listExperiments from "../modules/handlers/list-experiments.ts";
import listResults from "../modules/handlers/list-results.ts";
import {
  experimentRepository,
  resultRepository,
  type Experiment,
  type ExperimentResult,
} from "../modules/repositories/experiments.ts";

function setEnv(key: string, value: string) {
  (environment as Record<string, string | undefined>)[key] = value;
}
function clearEnv(key: string) {
  delete (environment as Record<string, string | undefined>)[key];
}

const routes = {
  "GET /experiments": listExperiments,
  "GET /results": listResults,
};

async function clearAll(tenants: string[] = ["tenant-a", "tenant-b"]) {
  for (const t of tenants) {
    const exps = await experimentRepository.list(t, { limit: 200 });
    for (const e of exps.items) await experimentRepository.delete(t, e.id);
    const ress = await resultRepository.list(t, { limit: 200 });
    for (const r of ress.items) await resultRepository.delete(t, r.id);
  }
}

async function seedExperiment(
  tenantId: string,
  overrides: Partial<Omit<Experiment, "id" | "tenantId">> = {},
): Promise<Experiment> {
  return experimentRepository.create(tenantId, {
    key: overrides.key ?? "exp_signup",
    name: overrides.name ?? "Signup Improvements",
    hypothesis: overrides.hypothesis ?? "New copy improves signup conversion.",
    status: overrides.status ?? "running",
    variants: overrides.variants ?? [
      { key: "control", weight: 50, payload: {} },
      { key: "treatment", weight: 50, payload: { copy: "free trial" } },
    ],
    metricGoals: overrides.metricGoals ?? ["signup_rate"],
    startedAt: overrides.startedAt ?? "2024-01-01T00:00:00.000Z",
    completedAt: overrides.completedAt ?? null,
    winnerVariantKey: overrides.winnerVariantKey ?? null,
    createdAt: overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
  });
}

async function seedResult(
  tenantId: string,
  data: Omit<ExperimentResult, "id" | "tenantId">,
): Promise<ExperimentResult> {
  return resultRepository.create(tenantId, data);
}

// ---------------------------------------------------------------------------
// interpret_results
// ---------------------------------------------------------------------------

describe("orchestrators/interpret_results", () => {
  beforeEach(async () => {
    await clearAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("POSTHOG_PERSONAL_API_KEY");
    clearEnv("POSTHOG_PROJECT_ID");
  });

  it("happy path: computes lift vs control and a recommendation", async () => {
    await seedExperiment("tenant-a");
    await seedResult("tenant-a", {
      experimentKey: "exp_signup",
      variantKey: "control",
      metricKey: "signup_rate",
      mean: 0.10,
      stddev: 0.01,
      sampleSize: 5000,
      pValue: 1,
      computedAt: "2024-01-10",
    });
    await seedResult("tenant-a", {
      experimentKey: "exp_signup",
      variantKey: "treatment",
      metricKey: "signup_rate",
      mean: 0.13,
      stddev: 0.01,
      sampleSize: 5000,
      pValue: 0.01,
      computedAt: "2024-01-10",
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("nope", { status: 500 }));

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/interpret-results",
      method: "POST",
      body: { experimentKey: "exp_signup" },
      tenantId: "tenant-a",
    });
    const res = await interpretResults(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      controlVariant: string;
      variantSummaries: Array<{
        variantKey: string;
        liftPercent: number | null;
        significant: boolean;
      }>;
      recommendation: string;
      posthogExposures: unknown;
    };
    expect(json.controlVariant).toBe("control");
    const treatment = json.variantSummaries.find((v) => v.variantKey === "treatment");
    expect(treatment?.significant).toBe(true);
    expect(Math.round(treatment?.liftPercent ?? 0)).toBe(30);
    expect(json.recommendation).toContain("Ship variant treatment");
    // PostHog vars unset -> no PostHog fetch.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(json.posthogExposures).toBeNull();
  });

  it("no-op when no results are present: recommendation says inconclusive", async () => {
    await seedExperiment("tenant-a");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/interpret-results",
      method: "POST",
      body: { experimentKey: "exp_signup" },
      tenantId: "tenant-a",
    });
    const res = await interpretResults(request, context);
    const json = (await res.json()) as {
      recommendation: string;
      variantSummaries: Array<{ sampleSize: number; significant: boolean }>;
    };
    expect(json.recommendation).toMatch(/inconclusive|reached significance/);
    for (const v of json.variantSummaries) {
      expect(v.sampleSize).toBe(0);
      expect(v.significant).toBe(false);
    }
  });

  it("includePostHogExposures=true triggers PostHog query when configured", async () => {
    setEnv("POSTHOG_PERSONAL_API_KEY", "phx_test");
    setEnv("POSTHOG_PROJECT_ID", "1");
    await seedExperiment("tenant-a");
    await seedResult("tenant-a", {
      experimentKey: "exp_signup",
      variantKey: "control",
      metricKey: "signup_rate",
      mean: 0.1,
      stddev: 0.01,
      sampleSize: 100,
      pValue: 1,
      computedAt: "x",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            ["control", 100, 200],
            ["treatment", 95, 190],
          ],
          columns: ["variant", "users", "events"],
        }),
        { status: 200 },
      ),
    );
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/interpret-results",
      method: "POST",
      body: { experimentKey: "exp_signup" },
      tenantId: "tenant-a",
    });
    const res = await interpretResults(request, context);
    const json = (await res.json()) as {
      posthogExposures: Array<{ variant: string; users: number }>;
    };
    expect(json.posthogExposures).toEqual([
      { variant: "control", users: 100, events: 200 },
      { variant: "treatment", users: 95, events: 190 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("includePostHogExposures=false skips PostHog even when configured", async () => {
    setEnv("POSTHOG_PERSONAL_API_KEY", "phx_test");
    setEnv("POSTHOG_PROJECT_ID", "1");
    await seedExperiment("tenant-a");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("nope", { status: 500 }));
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/interpret-results",
      method: "POST",
      body: { experimentKey: "exp_signup", includePostHogExposures: false },
      tenantId: "tenant-a",
    });
    await interpretResults(request, context);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the experimentKey doesn't exist for this tenant", async () => {
    await seedExperiment("tenant-b");
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/interpret-results",
      method: "POST",
      body: { experimentKey: "exp_signup" },
      tenantId: "tenant-a",
    });
    const res = await interpretResults(request, context);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// kill_underperforming_variant
// ---------------------------------------------------------------------------

describe("orchestrators/kill_underperforming_variant", () => {
  beforeEach(async () => {
    await clearAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: zeros out variants whose lift falls below the threshold", async () => {
    await seedExperiment("tenant-a", {
      key: "exp_kill",
      variants: [
        { key: "control", weight: 33, payload: {} },
        { key: "treatment_a", weight: 33, payload: {} },
        { key: "treatment_b", weight: 34, payload: {} },
      ],
    });
    await seedResult("tenant-a", {
      experimentKey: "exp_kill",
      variantKey: "control",
      metricKey: "x",
      mean: 0.10,
      stddev: 0.01,
      sampleSize: 1000,
      pValue: 1,
      computedAt: "x",
    });
    await seedResult("tenant-a", {
      experimentKey: "exp_kill",
      variantKey: "treatment_a",
      metricKey: "x",
      mean: 0.05, // -50% lift
      stddev: 0.01,
      sampleSize: 1000,
      pValue: 0.01,
      computedAt: "x",
    });
    await seedResult("tenant-a", {
      experimentKey: "exp_kill",
      variantKey: "treatment_b",
      metricKey: "x",
      mean: 0.11,
      stddev: 0.01,
      sampleSize: 1000,
      pValue: 0.05,
      computedAt: "x",
    });

    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/kill-underperforming-variant",
      method: "POST",
      body: { experimentKey: "exp_kill", liftThresholdPercent: -10 },
      tenantId: "tenant-a",
    });
    const res = await killUnderperformingVariant(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      killedVariants: string[];
      proposedVariants: Array<{ key: string; weight: number }>;
    };
    expect(json.killedVariants).toEqual(["treatment_a"]);
    const a = json.proposedVariants.find((v) => v.key === "treatment_a");
    expect(a?.weight).toBe(0);
    const b = json.proposedVariants.find((v) => v.key === "treatment_b");
    expect(b?.weight).toBe(34);
  });

  it("no-op: nothing falls below threshold — killedVariants is empty", async () => {
    await seedExperiment("tenant-a", { key: "exp_ok" });
    await seedResult("tenant-a", {
      experimentKey: "exp_ok",
      variantKey: "control",
      metricKey: "x",
      mean: 0.10,
      stddev: 0.01,
      sampleSize: 1000,
      pValue: 1,
      computedAt: "x",
    });
    await seedResult("tenant-a", {
      experimentKey: "exp_ok",
      variantKey: "treatment",
      metricKey: "x",
      mean: 0.105,
      stddev: 0.01,
      sampleSize: 1000,
      pValue: 0.04,
      computedAt: "x",
    });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/kill-underperforming-variant",
      method: "POST",
      body: { experimentKey: "exp_ok" },
      tenantId: "tenant-a",
    });
    const res = await killUnderperformingVariant(request, context);
    const json = (await res.json()) as { killedVariants: string[] };
    expect(json.killedVariants).toEqual([]);
  });

  it("returns 400 when experimentKey is missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/kill-underperforming-variant",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await killUnderperformingVariant(request, context);
    expect(res.status).toBe(400);
  });

  it("multi-tenant isolation: tenant-a cannot operate on tenant-b's experiment", async () => {
    await seedExperiment("tenant-b", { key: "exp_b" });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/kill-underperforming-variant",
      method: "POST",
      body: { experimentKey: "exp_b" },
      tenantId: "tenant-a",
    });
    const res = await killUnderperformingVariant(request, context);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// propose_experiment_for_metric
// ---------------------------------------------------------------------------

describe("orchestrators/propose_experiment_for_metric", () => {
  beforeEach(async () => {
    await clearAll();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: surfaces past completed experiments matching the metric", async () => {
    await seedExperiment("tenant-a", {
      key: "exp_old_signup",
      name: "Improve signup",
      status: "completed",
      metricGoals: ["signup_rate"],
      winnerVariantKey: "treatment",
      variants: [
        { key: "control", weight: 50, payload: {} },
        { key: "treatment", weight: 50, payload: { copy: "free trial" } },
      ],
      completedAt: "2024-02-01",
    });
    await seedExperiment("tenant-a", {
      key: "exp_irrelevant",
      name: "Other thing",
      status: "completed",
      metricGoals: ["pageview_count"],
      winnerVariantKey: null,
      completedAt: "2024-02-01",
    });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/propose-experiment-for-metric",
      method: "POST",
      body: { metricKey: "signup_rate" },
      tenantId: "tenant-a",
    });
    const res = await proposeExperimentForMetric(request, context);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      candidateCount: number;
      winningProposalCount: number;
      proposals: Array<{ sourceExperimentKey: string }>;
      proposedExperimentDraft: { keyHint: string; suggestedVariants: unknown[] };
    };
    expect(json.candidateCount).toBe(1);
    expect(json.winningProposalCount).toBe(1);
    expect(json.proposals[0].sourceExperimentKey).toBe("exp_old_signup");
    expect(json.proposedExperimentDraft.keyHint).toContain("signup_rate_recovery_");
  });

  it("no-op when no completed experiments match the metric", async () => {
    await seedExperiment("tenant-a", {
      key: "exp_running",
      status: "running",
      metricGoals: ["signup_rate"],
    });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/propose-experiment-for-metric",
      method: "POST",
      body: { metricKey: "signup_rate" },
      tenantId: "tenant-a",
    });
    const res = await proposeExperimentForMetric(request, context);
    const json = (await res.json()) as { candidateCount: number };
    expect(json.candidateCount).toBe(0);
  });

  it("returns 400 when metricKey is missing", async () => {
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/propose-experiment-for-metric",
      method: "POST",
      body: {},
      tenantId: "tenant-a",
    });
    const res = await proposeExperimentForMetric(request, context);
    expect(res.status).toBe(400);
  });

  it("multi-tenant isolation: tenant-a does not see tenant-b's completed experiments", async () => {
    await seedExperiment("tenant-b", {
      key: "exp_b",
      name: "Improve signup",
      status: "completed",
      metricGoals: ["signup_rate"],
      winnerVariantKey: "treatment",
    });
    const { context } = makeContext({ routes, tenantId: "tenant-a" });
    const request = makeRequest({
      url: "https://kit.test/propose-experiment-for-metric",
      method: "POST",
      body: { metricKey: "signup_rate" },
      tenantId: "tenant-a",
    });
    const res = await proposeExperimentForMetric(request, context);
    const json = (await res.json()) as { candidateCount: number };
    expect(json.candidateCount).toBe(0);
  });
});
