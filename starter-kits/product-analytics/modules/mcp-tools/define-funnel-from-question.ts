import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { getTenant } from "@zuplo/starter-kit-shared/auth";
import { runPostHogQuery } from "../integrations/posthog.ts";
import { clickhouseQuery, eventsTableId, escapeString } from "../integrations/clickhouse.ts";

/**
 * Orchestrator: define_funnel_from_question.
 *
 * Builds a candidate event list (from the caller, ClickHouse, or PostHog)
 * and proposes an ordered funnel by scoring token overlap with the
 * natural-language question. The result includes per-event volumes and a
 * suggested funnel definition the caller can hand straight to `create_funnel`.
 *
 * Sources for `candidateEvents`:
 *   1. The caller passes them in `body.candidateEvents` (highest priority).
 *   2. If POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID are set: query the
 *      most-frequent events in the last 30 days via HogQL.
 *   3. If DB_PROVIDER=clickhouse: pull distinct event names from the kit's
 *      own events table, ranked by count.
 */

interface Body {
  question: string;
  candidateEvents?: string[];
  /** How many top events to consider when discovering. Defaults to 30. */
  discoveryLimit?: number;
  /** Day window for the discovery query. Defaults to 30. */
  windowDays?: number;
  /** Tenant override — defaults to the request tenant. Used by the local discovery branch. */
  tenantId?: string;
}

interface CandidateEvent {
  name: string;
  count: number;
  source: "caller" | "posthog" | "clickhouse";
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function eventTokens(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[_\s\-]+/)
    .filter(Boolean);
}

async function discoverFromPostHog(
  windowDays: number,
  limit: number,
): Promise<CandidateEvent[]> {
  const result = await runPostHogQuery({
    hogql: `
      SELECT event, count() AS volume
      FROM events
      WHERE timestamp >= now() - INTERVAL {window_days} DAY
      GROUP BY event
      ORDER BY volume DESC
      LIMIT {limit}
    `,
    parameters: { window_days: windowDays, limit },
  });
  return result.results.map((row) => ({
    name: String(row[0] ?? ""),
    count: Number(row[1] ?? 0),
    source: "posthog" as const,
  }));
}

async function discoverFromClickHouse(
  tenantId: string,
  windowDays: number,
  limit: number,
): Promise<CandidateEvent[]> {
  const sql = `
    SELECT name, count() AS volume
    FROM ${eventsTableId()}
    WHERE tenantId = ${escapeString(tenantId)}
      AND occurredAt >= toDateTime(now() - INTERVAL ${Number(windowDays)} DAY)
    GROUP BY name
    ORDER BY volume DESC
    LIMIT ${Number(limit)}
  `;
  const res = await clickhouseQuery<{ name: string; volume: string }>({ sql });
  return res.rows.map((r) => ({
    name: String(r.name ?? ""),
    count: Number(r.volume ?? 0),
    source: "clickhouse" as const,
  }));
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.question) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "question is required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const env = environment as Record<string, string | undefined>;
  const windowDays = Math.max(1, Math.min(365, body.windowDays ?? 30));
  const discoveryLimit = Math.max(5, Math.min(200, body.discoveryLimit ?? 30));

  // Discover candidates.
  let candidates: CandidateEvent[] = [];
  let discoverySource: "caller" | "posthog" | "clickhouse" | "none" = "none";
  if (Array.isArray(body.candidateEvents) && body.candidateEvents.length > 0) {
    candidates = body.candidateEvents.map((name) => ({
      name,
      count: 0,
      source: "caller" as const,
    }));
    discoverySource = "caller";
  } else if (env.POSTHOG_PERSONAL_API_KEY && env.POSTHOG_PROJECT_ID) {
    try {
      candidates = await discoverFromPostHog(windowDays, discoveryLimit);
      discoverySource = "posthog";
    } catch (err) {
      context.log.warn("PostHog discovery failed", { err: String(err) });
    }
  }
  if (candidates.length === 0 && env.DB_PROVIDER === "clickhouse" && env.CLICKHOUSE_URL) {
    try {
      const tenantId = body.tenantId ?? getTenant(request) ?? "default";
      candidates = await discoverFromClickHouse(tenantId, windowDays, discoveryLimit);
      discoverySource = "clickhouse";
    } catch (err) {
      context.log.warn("ClickHouse discovery failed", { err: String(err) });
    }
  }

  if (candidates.length === 0) {
    return new Response(
      JSON.stringify({
        error: {
          type: "no_candidates",
          message:
            "No candidateEvents passed and no event source configured (set POSTHOG_PERSONAL_API_KEY+POSTHOG_PROJECT_ID or DB_PROVIDER=clickhouse).",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const questionTokens = new Set(tokens(body.question));

  const ranked = candidates
    .map((c) => {
      const overlapped = eventTokens(c.name).filter((t) => questionTokens.has(t));
      return {
        eventName: c.name,
        eventCount: c.count,
        score: overlapped.length,
        matchedTokens: overlapped,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.eventCount - a.eventCount);

  // Order proposed steps by where they appear in the candidates list (caller's
  // intended ordering) once they cross the threshold. For discovered candidates,
  // sort by descending volume — funnels normally start with the most-common event.
  const candidateIndex = new Map(candidates.map((c, i) => [c.name, i]));
  const selected = ranked.slice(0, Math.min(6, ranked.length));
  selected.sort((a, b) => (candidateIndex.get(a.eventName) ?? 0) - (candidateIndex.get(b.eventName) ?? 0));

  const proposedSteps = selected.map((s) => ({
    eventName: s.eventName,
    filters: {} as Record<string, unknown>,
    matchedTokens: s.matchedTokens,
    eventCount: s.eventCount,
  }));

  return new Response(
    JSON.stringify({
      question: body.question,
      proposedSteps,
      discoverySource,
      candidatesConsidered: candidates.length,
      windowDays,
      questionTokens: Array.from(questionTokens),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
