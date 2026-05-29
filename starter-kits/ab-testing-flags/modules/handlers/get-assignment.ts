import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import {
  assignmentRepository,
  experimentRepository,
} from "../repositories/experiments.ts";

interface Body {
  userId: string;
}

/**
 * Sticky variant assignment.
 *
 * Looks up the experiment, finds an existing assignment for the user, and
 * returns it. If no assignment exists, samples one according to variant
 * weights, persists it, and returns the new assignment.
 */
function pickVariant(
  variants: Array<{ key: string; weight: number }>,
  seed: string,
): string | null {
  if (variants.length === 0) return null;
  const total = variants.reduce((sum, v) => sum + v.weight, 0);
  if (total <= 0) return variants[0]!.key;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const r = (hash / 0xffffffff) * total;
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight;
    if (r <= cumulative) return v.key;
  }
  return variants[variants.length - 1]!.key;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const experimentKey = request.params.key;
  const body = (await request.json()) as Body;

  let experiment;
  try {
    const url = new URL(request.url);
    const all = await experimentRepository.list(tenantId, { limit: 200 });
    experiment = all.items.find((e) => e.key === experimentKey);
    if (!experiment) throw new NotFoundError("Experiment", experimentKey);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: err.message } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }

  const existing = await assignmentRepository.list(tenantId, { limit: 200 });
  const found = existing.items.find(
    (a) => a.experimentKey === experimentKey && a.userId === body.userId,
  );
  if (found) {
    return new Response(JSON.stringify(found), {
      headers: { "content-type": "application/json" },
    });
  }

  const variantKey = pickVariant(experiment.variants, `${experimentKey}:${body.userId}`);
  if (!variantKey) {
    return new Response(
      JSON.stringify({ error: { type: "no_variant", message: "Experiment has no variants." } }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }
  const created = await assignmentRepository.create(tenantId, {
    experimentKey,
    userId: body.userId,
    variantKey,
    assignedAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
