import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type {
  Experiment,
  ExperimentResult,
} from "../repositories/experiments.ts";

/**
 * Orchestrator MCP tool: propose_experiment_for_metric.
 *
 * Given a metric and a desired drop in that metric, scan past completed
 * experiments for ones that targeted similar metrics and finished with a
 * positive lift, then suggest variant ideas based on the winners. Stub
 * matching — keyword substring — is intentionally simple; a production
 * fork would swap it for embeddings.
 */

interface Body {
  metricKey: string;
  dropPercent?: number;
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
  if (!body.metricKey) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "metricKey is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const dropPercent = body.dropPercent ?? 5;
  const auth = request.headers.get("authorization") ?? "";

  const experiments: Experiment[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", status: "completed" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ExperimentPage>(context, `/experiments?${qs}`, {
      headers: { authorization: auth },
    });
    experiments.push(...page.items.filter((e) => e.status === "completed"));
    cursor = page.nextCursor;
  } while (cursor);

  const metricKeyLower = body.metricKey.toLowerCase();
  const candidates = experiments.filter((e) =>
    e.metricGoals.some((g) => g.toLowerCase().includes(metricKeyLower)) ||
    e.name.toLowerCase().includes(metricKeyLower),
  );

  const results: ExperimentResult[] = [];
  cursor = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<ResultPage>(context, `/results?${qs}`, {
      headers: { authorization: auth },
    });
    results.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  const proposals = candidates
    .map((exp) => {
      const winner = exp.winnerVariantKey
        ? exp.variants.find((v) => v.key === exp.winnerVariantKey)
        : exp.variants.find((v) => {
            const r = results.find((res) => res.experimentKey === exp.key && res.variantKey === v.key);
            const ctrlResult = results.find((res) => res.experimentKey === exp.key && res.variantKey === exp.variants[0]?.key);
            if (!r || !ctrlResult || ctrlResult.mean === 0) return false;
            return ((r.mean - ctrlResult.mean) / ctrlResult.mean) * 100 > 0;
          });
      if (!winner) return null;
      return {
        sourceExperimentKey: exp.key,
        sourceExperimentName: exp.name,
        sourceWinnerVariantKey: winner.key,
        suggestedVariantPayload: winner.payload,
        suggestedVariantHypothesis: exp.hypothesis,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const proposedExperimentDraft = {
    keyHint: `${body.metricKey}_recovery_${Date.now()}`,
    nameHint: `Recover ${body.metricKey} (target +${dropPercent}%)`,
    metricGoals: [body.metricKey],
    suggestedVariants: [
      { key: "control", weight: 50, payload: {} },
      ...proposals.slice(0, 3).map((p, i) => ({
        key: `treatment_${i + 1}`,
        weight: Math.round(50 / Math.max(1, Math.min(3, proposals.length))),
        payload: p.suggestedVariantPayload,
        derivedFromExperimentKey: p.sourceExperimentKey,
      })),
    ],
  };

  return new Response(
    JSON.stringify({
      metricKey: body.metricKey,
      dropPercent,
      candidateCount: candidates.length,
      winningProposalCount: proposals.length,
      proposals,
      proposedExperimentDraft,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
