import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { flagRepository, experimentRepository } from "../repositories/experiments.ts";
import {
  decidePostHogFlags,
  capturePostHogEvent,
} from "../integrations/posthog.ts";

/**
 * `POST /v1/flags/{key}/decide` — resolve a flag for a user.
 *
 * Resolution order:
 *   1. If POSTHOG_API_KEY is set AND the flag has `source: "posthog"` (or no
 *      local flag exists with this key) — call PostHog /decide and trust it.
 *   2. Otherwise — do consistent-hash assignment locally against the kit's
 *      flag rollout config (or matching experiment variants).
 *
 * Either way, if POSTHOG_API_KEY is set, we $feature_flag_called capture so
 * existing PostHog dashboards see the exposure.
 */

interface Body {
  distinctId: string;
  /** Group bag for B2B-style targeting (e.g. { company: "acme" }). */
  groups?: Record<string, string>;
  /** Person properties for property-based targeting. */
  personProperties?: Record<string, unknown>;
  /** Group properties keyed by group type. */
  groupProperties?: Record<string, Record<string, unknown>>;
  /**
   * If true, bypass the local-first cascade and always call PostHog. Useful
   * to A/B-test the decision plane.
   */
  forcePostHog?: boolean;
}

/**
 * djb2 — classic non-crypto hash. Stable across runtimes (no Math.random,
 * no built-in non-crypto API in the edge runtime). Used for both flag
 * percentage rollouts and experiment variant assignment.
 */
function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function bucket(seed: string): number {
  return hash(seed) / 0xffffffff; // 0..1
}

function pickVariantWeighted(
  variants: Array<{ key: string; weight: number }>,
  seed: string,
): string | null {
  if (variants.length === 0) return null;
  const total = variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (total <= 0) return variants[0]!.key;
  const r = bucket(seed) * total;
  let acc = 0;
  for (const v of variants) {
    acc += Math.max(0, v.weight);
    if (r <= acc) return v.key;
  }
  return variants[variants.length - 1]!.key;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const flagKey = request.params.key;
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.distinctId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "distinctId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const env = environment as Record<string, string | undefined>;
  const posthogConfigured = Boolean(env.POSTHOG_API_KEY);

  // Local lookup first (so we know the source).
  const flagsPage = await flagRepository.list(tenantId, { limit: 200 });
  const localFlag = flagsPage.items.find((f) => f.key === flagKey);
  const expPage = await experimentRepository.list(tenantId, { limit: 200 });
  const linkedExperiment = expPage.items.find((e) => e.key === flagKey);

  const wantPostHog =
    body.forcePostHog ||
    (posthogConfigured && (!localFlag || (localFlag as Record<string, unknown>).source === "posthog"));

  // 1) PostHog path.
  if (wantPostHog) {
    try {
      const decided = await decidePostHogFlags({
        distinctId: body.distinctId,
        groups: body.groups,
        personProperties: body.personProperties,
        groupProperties: body.groupProperties,
      });
      const value = decided.featureFlags[flagKey];
      const payload = decided.featureFlagPayloads?.[flagKey];
      // Mirror the exposure as an event so dashboards see it. Silent on failure.
      capturePostHogEvent({
        distinctId: body.distinctId,
        event: "$feature_flag_called",
        properties: {
          $feature_flag: flagKey,
          $feature_flag_response: value,
          source: "zuplo-gateway",
        },
        groups: body.groups,
      }).catch((err) => context.log.warn("PostHog capture failed", { err: String(err) }));
      return new Response(
        JSON.stringify({
          flagKey,
          value: value ?? null,
          payload: payload ?? null,
          source: "posthog",
          distinctId: body.distinctId,
        }),
        { headers: { "content-type": "application/json" } },
      );
    } catch (err) {
      context.log.warn("PostHog decide failed; falling through to local", {
        err: String(err),
      });
      // Intentional fall-through to local resolution.
    }
  }

  // 2) Local path — flag rollout or linked experiment.
  if (localFlag && Array.isArray(localFlag.rollout) && localFlag.rollout.length > 0) {
    // Pick the highest-percent matching variant for this user via consistent hash.
    const seed = `${tenantId}:${flagKey}:${body.distinctId}`;
    for (const r of localFlag.rollout) {
      const slot = bucket(`${seed}:${r.segmentSlug}`);
      if (slot * 100 < r.percent) {
        // Mirror to PostHog if configured.
        if (posthogConfigured) {
          capturePostHogEvent({
            distinctId: body.distinctId,
            event: "$feature_flag_called",
            properties: {
              $feature_flag: flagKey,
              $feature_flag_response: r.variantKey,
              source: "zuplo-gateway-local",
            },
            groups: body.groups,
          }).catch(() => undefined);
        }
        return new Response(
          JSON.stringify({
            flagKey,
            value: r.variantKey,
            payload: null,
            source: "local-rollout",
            distinctId: body.distinctId,
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
    }
    // No slot matched — return the default value.
    return new Response(
      JSON.stringify({
        flagKey,
        value: localFlag.defaultValue ?? null,
        payload: null,
        source: "local-default",
        distinctId: body.distinctId,
      }),
      { headers: { "content-type": "application/json" } },
    );
  }

  if (linkedExperiment) {
    const variant = pickVariantWeighted(
      linkedExperiment.variants,
      `${tenantId}:${flagKey}:${body.distinctId}`,
    );
    if (posthogConfigured) {
      capturePostHogEvent({
        distinctId: body.distinctId,
        event: "$feature_flag_called",
        properties: {
          $feature_flag: flagKey,
          $feature_flag_response: variant,
          source: "zuplo-gateway-experiment",
        },
        groups: body.groups,
      }).catch(() => undefined);
    }
    return new Response(
      JSON.stringify({
        flagKey,
        value: variant,
        payload: null,
        source: "local-experiment",
        distinctId: body.distinctId,
      }),
      { headers: { "content-type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ error: { type: "not_found", message: `No flag or experiment with key ${flagKey}` } }),
    { status: 404, headers: { "content-type": "application/json" } },
  );
}
