import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { cohortRepository, eventRepository, sessionRepository, type Cohort } from "../repositories/events.ts";

/**
 * Orchestrator: compare_cohorts.
 *
 * Pulls users in two cohorts (by slug), then for each cohort computes the
 * requested metric per user and returns mean + count. Useful for "did the
 * pro plan reduce session count vs free plan?" style questions.
 */

interface Body {
  cohortSlugA: string;
  cohortSlugB: string;
  metric: "session_count" | "event_count";
}

async function findCohort(tenantId: string, slug: string): Promise<Cohort | null> {
  let cursor: string | null | undefined;
  do {
    const page = await cohortRepository.list(tenantId, {
      limit: 200,
      cursor: cursor ?? undefined,
    });
    const match = page.items.find((c) => c.slug === slug);
    if (match) return match;
    cursor = page.nextCursor;
  } while (cursor);
  return null;
}

async function metricsForUserIds(
  tenantId: string,
  userIds: string[],
  metric: Body["metric"],
): Promise<{ mean: number; count: number }> {
  if (userIds.length === 0) return { mean: 0, count: 0 };
  const userIdSet = new Set(userIds);
  const perUser: Record<string, number> = {};
  for (const id of userIds) perUser[id] = 0;

  if (metric === "event_count") {
    let cursor: string | null | undefined;
    do {
      const page = await eventRepository.list(tenantId, {
        limit: 200,
        cursor: cursor ?? undefined,
      });
      for (const e of page.items) {
        if (userIdSet.has(e.userId)) perUser[e.userId] += 1;
      }
      cursor = page.nextCursor;
    } while (cursor);
  } else {
    let cursor: string | null | undefined;
    do {
      const page = await sessionRepository.list(tenantId, {
        limit: 200,
        cursor: cursor ?? undefined,
      });
      for (const s of page.items) {
        if (userIdSet.has(s.userId)) perUser[s.userId] += 1;
      }
      cursor = page.nextCursor;
    } while (cursor);
  }

  const sum = Object.values(perUser).reduce((a, b) => a + b, 0);
  return { mean: sum / userIds.length, count: userIds.length };
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.cohortSlugA || !body.cohortSlugB || !body.metric) {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "cohortSlugA, cohortSlugB, and metric are required",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  if (body.metric !== "session_count" && body.metric !== "event_count") {
    return new Response(
      JSON.stringify({
        error: {
          type: "bad_request",
          message: "metric must be 'session_count' or 'event_count'",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const tenantId = requireTenant(request);
  const auth = { authorization: request.headers.get("authorization") ?? "" };
  void auth;

  const [cohortA, cohortB] = await Promise.all([
    findCohort(tenantId, body.cohortSlugA),
    findCohort(tenantId, body.cohortSlugB),
  ]);

  if (!cohortA || !cohortB) {
    return new Response(
      JSON.stringify({
        error: {
          type: "not_found",
          message: `Cohort not found: ${!cohortA ? body.cohortSlugA : body.cohortSlugB}`,
        },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  // Re-use compute_cohort logic via the repositories: pull matching users.
  // To avoid re-implementing matching here, we treat criteria as flat traits.
  // The same logic lives in handlers/compute-cohort.ts.
  const { userRepository } = await import("../repositories/events.ts");
  const matched = async (cohort: Cohort): Promise<string[]> => {
    const criteria = cohort.criteria ?? {};
    const matches: string[] = [];
    let cursor: string | null | undefined;
    do {
      const page = await userRepository.list(tenantId, {
        limit: 200,
        cursor: cursor ?? undefined,
      });
      for (const u of page.items) {
        let ok = true;
        for (const [key, value] of Object.entries(criteria)) {
          if (key === "identifiedEmail") {
            if (u.identifiedEmail !== value) {
              ok = false;
              break;
            }
            continue;
          }
          if ((u.traits ?? {})[key] !== value) {
            ok = false;
            break;
          }
        }
        if (ok) matches.push(u.id);
      }
      cursor = page.nextCursor;
    } while (cursor);
    return matches;
  };

  const [usersA, usersB] = await Promise.all([matched(cohortA), matched(cohortB)]);
  const [metricsA, metricsB] = await Promise.all([
    metricsForUserIds(tenantId, usersA, body.metric),
    metricsForUserIds(tenantId, usersB, body.metric),
  ]);

  return new Response(
    JSON.stringify({
      metric: body.metric,
      cohortA: {
        slug: cohortA.slug,
        userCount: metricsA.count,
        mean: metricsA.mean,
      },
      cohortB: {
        slug: cohortB.slug,
        userCount: metricsB.count,
        mean: metricsB.mean,
      },
      delta: metricsA.mean - metricsB.mean,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
