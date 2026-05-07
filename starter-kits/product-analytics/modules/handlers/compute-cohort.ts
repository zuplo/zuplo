import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { cohortRepository, userRepository, type Cohort, type User } from "../repositories/events.ts";

interface Body {
  cohortSlug: string;
  sampleSize?: number;
}

/**
 * A criteria object is a flat key/value map of user-trait predicates that
 * must all match. e.g. { plan: "pro", country: "US" } would match users
 * whose `traits.plan === "pro"` AND `traits.country === "US"`.
 *
 * Special key `identifiedEmail` is matched against the top-level User field.
 */
function userMatchesCriteria(user: User, criteria: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(criteria)) {
    if (key === "identifiedEmail") {
      if (user.identifiedEmail !== value) return false;
      continue;
    }
    if ((user.traits ?? {})[key] !== value) return false;
  }
  return true;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const sampleSize = Math.max(1, Math.min(100, body.sampleSize ?? 10));

  let cohort: Cohort | null = null;
  let cohortCursor: string | null | undefined;
  do {
    const page = await cohortRepository.list(tenantId, {
      limit: 200,
      cursor: cohortCursor ?? undefined,
    });
    const match = page.items.find((c) => c.slug === body.cohortSlug);
    if (match) {
      cohort = match;
      break;
    }
    cohortCursor = page.nextCursor;
  } while (cohortCursor);

  if (!cohort) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Cohort not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const matched: User[] = [];
  let userCursor: string | null | undefined;
  do {
    const page = await userRepository.list(tenantId, {
      limit: 200,
      cursor: userCursor ?? undefined,
    });
    for (const u of page.items) {
      if (userMatchesCriteria(u, cohort.criteria ?? {})) matched.push(u);
    }
    userCursor = page.nextCursor;
    if (matched.length > 100000) break;
  } while (userCursor);

  const computedAt = new Date().toISOString();
  try {
    await cohortRepository.update(tenantId, cohort.id, {
      userCount: matched.length,
      computedAt,
    });
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }

  return new Response(
    JSON.stringify({
      cohortSlug: cohort.slug,
      userCount: matched.length,
      sampleUserIds: matched.slice(0, sampleSize).map((u) => u.id),
      computedAt,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
