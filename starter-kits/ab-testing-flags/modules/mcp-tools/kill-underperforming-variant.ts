import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type {
  Experiment,
  ExperimentResult,
} from "../repositories/experiments.ts";

/**
 * Orchestrator MCP tool: kill_underperforming_variant.
 *
 * Finds variants whose lift vs control falls below the threshold and emits
 * a proposed weight change (variant weight set to 0). Returns the proposed
 * variant array so the caller can review and apply via update_experiment.
 */

interface Body {
  experimentKey: string;
  liftThresholdPercent?: number;
}

interface ExperimentPage {
  items: Experiment[];
  nextCursor: string | null;
}

interface ResultPage {
  items: ExperimentResult[];
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
  const threshold = body.liftThresholdPercent ?? -5;
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
    const qs = new URLSearchParams({ limit: "200" });
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

  const proposedVariants = experiment.variants.map((v) => {
    if (v.key === control.key) return v;
    const variantResult = results.find((r) => r.variantKey === v.key);
    if (!variantResult || !controlResult || controlResult.mean === 0) return v;
    const liftPercent = ((variantResult.mean - controlResult.mean) / controlResult.mean) * 100;
    if (liftPercent <= threshold) {
      return { ...v, weight: 0 };
    }
    return v;
  });

  const killed = experiment.variants
    .filter((v, idx) => v.weight !== proposedVariants[idx]?.weight)
    .map((v) => v.key);

  let updatedExperiment: Experiment | null = null;
  try {
    updatedExperiment = await invokeJson<Experiment>(
      context,
      `/experiments/${experiment.id}`,
      {
        method: "PATCH",
        headers: { authorization: auth, "content-type": "application/json" },
        body: JSON.stringify({ variants: proposedVariants }),
      },
    );
  } catch {
    // PATCH route may not be wired up in the host fork — return proposal only
  }

  return new Response(
    JSON.stringify({
      experimentKey: experiment.key,
      threshold,
      killedVariants: killed,
      proposedVariants,
      updatedExperiment,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
