import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  eventRepository,
  funnelRepository,
  type Event,
  type Funnel,
} from "../repositories/events.ts";
import { computeFunnelInClickHouse } from "../integrations/clickhouse.ts";

interface Body {
  funnelSlug: string;
  dateFrom?: string;
  dateTo?: string;
  /** Force in-memory computation even when DB_PROVIDER=clickhouse. Useful for tests. */
  forceMemory?: boolean;
}

/**
 * Compute funnel step counts. When the kit is on the ClickHouse adapter
 * (DB_PROVIDER=clickhouse), the computation pushes down into a single
 * `windowFunnel` SQL query. Otherwise it falls back to an in-memory
 * algorithm that walks events per user. Filters on each step do simple
 * equality checks on the event's `properties` object.
 */
function eventMatchesStep(
  ev: Event,
  step: { eventName: string; filters: Record<string, unknown> },
): boolean {
  if (ev.name !== step.eventName) return false;
  for (const [key, value] of Object.entries(step.filters ?? {})) {
    if ((ev.properties ?? {})[key] !== value) return false;
  }
  return true;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  // Look up funnel by slug.
  let funnel: Funnel | null = null;
  let funnelCursor: string | null | undefined;
  do {
    const page = await funnelRepository.list(tenantId, {
      limit: 200,
      cursor: funnelCursor ?? undefined,
    });
    const match = page.items.find((f) => f.slug === body.funnelSlug);
    if (match) {
      funnel = match;
      break;
    }
    funnelCursor = page.nextCursor;
  } while (funnelCursor);

  if (!funnel) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Funnel not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const fromMs = body.dateFrom ? new Date(body.dateFrom).getTime() : 0;
  const toMs = body.dateTo ? new Date(body.dateTo).getTime() : Date.now();
  const dateFrom = body.dateFrom ?? new Date(0).toISOString();
  const dateTo = body.dateTo ?? new Date().toISOString();

  // Push down to ClickHouse when available. Per-tenant scoped via the SQL
  // WHERE clause in the integration helper.
  const env = environment as Record<string, string | undefined>;
  const provider = env.DB_PROVIDER ?? "in-memory";
  const usingClickHouse =
    provider === "clickhouse" && Boolean(env.CLICKHOUSE_URL) && !body.forceMemory;

  if (usingClickHouse) {
    try {
      const result = await computeFunnelInClickHouse({
        tenantId,
        steps: funnel.steps.map((s) => ({
          eventName: s.eventName,
          filters: s.filters ?? {},
        })),
        dateFrom,
        dateTo,
      });
      return new Response(
        JSON.stringify({
          funnelSlug: funnel.slug,
          dateFrom: body.dateFrom ?? null,
          dateTo: body.dateTo ?? null,
          usersConsidered: result.usersConsidered,
          steps: result.steps,
          backend: "clickhouse",
        }),
        { headers: { "content-type": "application/json" } },
      );
    } catch (err) {
      context.log.warn("ClickHouse funnel failed, falling back to memory", {
        err: String(err),
      });
      // Intentional fall-through.
    }
  }

  // In-memory fallback. Production analytics adapters (clickhouse) push this
  // down to SQL via the integration above.
  const events: Event[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await eventRepository.list(tenantId, {
      limit: 200,
      cursor: cursor ?? undefined,
    });
    for (const e of page.items) {
      const t = new Date(e.occurredAt).getTime();
      if (t >= fromMs && t <= toMs) events.push(e);
    }
    cursor = page.nextCursor;
    if (events.length > 50000) break;
  } while (cursor);

  // Group events per user, ordered by occurredAt.
  const byUser: Record<string, Event[]> = {};
  for (const e of events) {
    (byUser[e.userId] ??= []).push(e);
  }
  for (const list of Object.values(byUser)) {
    list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  // Per-step user counts.
  const stepCounts: Array<{ eventName: string; count: number }> = funnel.steps.map((s) => ({
    eventName: s.eventName,
    count: 0,
  }));

  for (const userEvents of Object.values(byUser)) {
    let stepIdx = 0;
    let cursorTime = -Infinity;
    let advanced = false;
    for (const ev of userEvents) {
      while (stepIdx < funnel.steps.length) {
        const t = new Date(ev.occurredAt).getTime();
        if (t < cursorTime) break;
        if (eventMatchesStep(ev, funnel.steps[stepIdx])) {
          stepCounts[stepIdx].count += 1;
          stepIdx += 1;
          cursorTime = t;
          advanced = true;
          break;
        }
        // Event didn't match the next pending step; try the next event.
        break;
      }
      if (stepIdx >= funnel.steps.length) break;
    }
    void advanced;
  }

  // Build conversion rates against the previous step.
  const stepResults = stepCounts.map((s, i) => {
    const prev = i === 0 ? s.count : stepCounts[i - 1].count;
    const conversion = prev > 0 ? s.count / prev : 0;
    return {
      stepIndex: i,
      eventName: s.eventName,
      count: s.count,
      conversionFromPrev: conversion,
    };
  });

  return new Response(
    JSON.stringify({
      funnelSlug: funnel.slug,
      dateFrom: body.dateFrom ?? null,
      dateTo: body.dateTo ?? null,
      usersConsidered: Object.keys(byUser).length,
      steps: stepResults,
      backend: "memory",
    }),
    { headers: { "content-type": "application/json" } },
  );
}
