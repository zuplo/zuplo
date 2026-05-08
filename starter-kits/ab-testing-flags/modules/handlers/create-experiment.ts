import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { experimentRepository, type Experiment } from "../repositories/experiments.ts";
import { upsertPostHogFlag } from "../integrations/posthog.ts";

interface Body {
  key: string;
  name: string;
  hypothesis?: string;
  variants: Experiment["variants"];
  metricGoals?: string[];
  /** If true and POSTHOG_PROJECT_ID is set, mirror this experiment as a PostHog feature flag with multivariate variants. */
  mirrorToPostHog?: boolean;
}

/**
 * Create an experiment and (optionally) mirror it as a PostHog feature flag
 * so existing PostHog dashboards / experiments / cohorts can target by it.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await experimentRepository.create(tenantId, {
    key: body.key,
    name: body.name,
    hypothesis: body.hypothesis ?? "",
    status: "draft",
    variants: body.variants,
    metricGoals: body.metricGoals ?? [],
    startedAt: null,
    completedAt: null,
    winnerVariantKey: null,
    createdAt: new Date().toISOString(),
  });

  let posthogFlag: { id: number; key: string } | null = null;
  let posthogError: string | null = null;
  const env = environment as Record<string, string | undefined>;
  if (body.mirrorToPostHog && env.POSTHOG_PERSONAL_API_KEY && env.POSTHOG_PROJECT_ID) {
    try {
      const totalWeight = body.variants.reduce((s, v) => s + Math.max(0, v.weight), 0) || 1;
      posthogFlag = await upsertPostHogFlag({
        key: body.key,
        name: body.name,
        variants: body.variants.map((v) => ({
          key: v.key,
          rolloutPercentage: Math.round((Math.max(0, v.weight) / totalWeight) * 100),
        })),
        active: false, // Created in draft state to match the experiment status.
      });
    } catch (err) {
      // Log the full error server-side; return only a generic flag to the caller.
      context.log.warn("PostHog flag mirror failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      posthogError = "mirror_failed";
    }
  }

  return new Response(
    JSON.stringify({ ...created, posthogFlag, posthogError }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
