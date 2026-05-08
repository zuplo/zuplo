import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type {
  Experiment,
  ExperimentResult,
} from "../repositories/experiments.ts";
import { runPostHogQuery } from "../integrations/posthog.ts";

/**
 * Orchestrator MCP tool: interpret_results.
 *
 * Reads the experiment + its computed results, finds the control variant
 * (first one in the variants list), computes lift relative to control for
 * each other variant, marks anything with pValue < 0.05 as significant,
 * and emits a recommendation.
 *
 * If POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID are set, the tool also
 * runs a HogQL query against `$feature_flag_called` events to surface live
 * exposure counts per variant — useful when the kit is mirroring flags to
 * PostHog and you want a sanity-check that traffic is actually flowing.
 */

interface Body {
  experimentKey: string;
  /** If true, query PostHog for live exposure counts. Default true when configured. */
  includePostHogExposures?: boolean;
}

interface ResultPage {
  items: ExperimentResult[];
  nextCursor: string | null;
}

interface ExperimentPage {
  items: Experiment[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.experimentKey) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "experimentKey is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = request.headers.get("authorization") ?? "";

  const expPage = await invokeJson<ExperimentPage>(context, `/experiments?limit=200`, {
    headers: { authorization: auth },
  });
  const experiment = expPage.items.find((e) => e.key === body.experimentKey);
  if (!experiment) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Experiment not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const results: ExperimentResult[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", experimentKey: body.experimentKey });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ResultPage>(context, `/results?${qs}`, {
      headers: { authorization: auth },
    });
    for (const r of page.items) {
      if (r.experimentKey === body.experimentKey) results.push(r);
    }
    cursor = page.nextCursor;
  } while (cursor);

  const control = experiment.variants[0];
  if (!control) {
    return new Response(
      JSON.stringify({ error: { type: "no_variants", message: "Experiment has no variants" } }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }
  const controlResult = results.find((r) => r.variantKey === control.key);

  const variantSummaries = experiment.variants.map((v) => {
    const variantResult = results.find((r) => r.variantKey === v.key);
    const liftPercent =
      controlResult && variantResult && controlResult.mean !== 0
        ? ((variantResult.mean - controlResult.mean) / controlResult.mean) * 100
        : null;
    const significant = variantResult ? variantResult.pValue < 0.05 : false;
    return {
      variantKey: v.key,
      isControl: v.key === control.key,
      mean: variantResult?.mean ?? null,
      stddev: variantResult?.stddev ?? null,
      sampleSize: variantResult?.sampleSize ?? 0,
      pValue: variantResult?.pValue ?? null,
      liftPercent,
      significant,
    };
  });

  const winner = variantSummaries
    .filter((s) => !s.isControl && s.significant && (s.liftPercent ?? -Infinity) > 0)
    .sort((a, b) => (b.liftPercent ?? 0) - (a.liftPercent ?? 0))[0];
  const recommendation = winner
    ? `Ship variant ${winner.variantKey} (lift ${winner.liftPercent?.toFixed(2)}% vs control, p<0.05).`
    : "No variant has reached significance. Keep running or end as inconclusive.";

  // Optional: pull live PostHog exposures so a CMO can sanity-check that the
  // flag is actually being delivered.
  const env = environment as Record<string, string | undefined>;
  const wantPostHog =
    body.includePostHogExposures !== false &&
    Boolean(env.POSTHOG_PERSONAL_API_KEY) &&
    Boolean(env.POSTHOG_PROJECT_ID);

  let posthogExposures: Array<{ variant: string; users: number; events: number }> | null = null;
  let posthogError: string | null = null;
  if (wantPostHog) {
    try {
      const queryResult = await runPostHogQuery({
        hogql: `
          SELECT
            properties.$feature_flag_response AS variant,
            count(DISTINCT distinct_id) AS users,
            count() AS events
          FROM events
          WHERE event = '$feature_flag_called'
            AND properties.$feature_flag = {flag_key}
            AND timestamp >= now() - INTERVAL 30 DAY
          GROUP BY variant
          ORDER BY users DESC
        `,
        parameters: { flag_key: body.experimentKey },
      });
      posthogExposures = queryResult.results.map((row) => ({
        variant: String(row[0] ?? ""),
        users: Number(row[1] ?? 0),
        events: Number(row[2] ?? 0),
      }));
    } catch (err) {
      // Log full error server-side; return only a generic flag to the caller.
      context.log.warn("PostHog exposures query failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      posthogError = "query_failed";
    }
  }

  return new Response(
    JSON.stringify({
      experimentKey: experiment.key,
      experimentStatus: experiment.status,
      controlVariant: control.key,
      variantSummaries,
      recommendation,
      posthogExposures,
      posthogError,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
