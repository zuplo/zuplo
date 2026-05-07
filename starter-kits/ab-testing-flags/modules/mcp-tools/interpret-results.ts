import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type {
  Experiment,
  ExperimentResult,
} from "../repositories/experiments.ts";

/**
 * Orchestrator MCP tool: interpret_results.
 *
 * Reads the experiment + its computed results, finds the control variant
 * (first one in the variants list), computes lift relative to control for
 * each other variant, marks anything with pValue < 0.05 as significant,
 * and emits a recommendation.
 */

interface Body {
  experimentKey: string;
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

  return new Response(
    JSON.stringify({
      experimentKey: experiment.key,
      experimentStatus: experiment.status,
      controlVariant: control.key,
      variantSummaries,
      recommendation,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
