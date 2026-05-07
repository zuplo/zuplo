import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Subscriber } from "../repositories/subscribers.ts";

/**
 * Orchestrator MCP tool: find_at_risk_subscribers.
 *
 * Lists active subscribers and surfaces those whose recent engagement
 * (read from the subscriber's `attributes`) suggests drop-off. The tool
 * uses two heuristics:
 *
 *   1. `recentOpenCount` (0 → at risk).
 *   2. `lastOpenedAt` older than `lookbackSends * 7` days (~one campaign
 *      per week).
 *
 * This works out-of-the-box on the in-memory adapter. Real deployments
 * should join against the Send entity; the join is intentionally left as
 * an extension point.
 */
interface Body {
  lookbackSends?: number;
}

interface SubscriberPage {
  items: Subscriber[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const lookbackSends = Math.max(1, Math.min(50, body.lookbackSends ?? 5));
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const subscribers: Subscriber[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<SubscriberPage>(context, `/subscribers?${qs}`, { headers: auth });
    subscribers.push(...page.items);
    cursor = page.nextCursor;
    if (subscribers.length > 5000) break;
  } while (cursor);

  const now = Date.now();
  const staleThresholdMs = lookbackSends * 7 * 24 * 60 * 60 * 1000;

  const atRisk = subscribers
    .filter((s) => s.status === "subscribed")
    .map((subscriber) => {
      const lastOpenedRaw = subscriber.attributes?.lastOpenedAt;
      const lastEngagementAt = typeof lastOpenedRaw === "string" ? lastOpenedRaw : null;
      const lastOpenedMs = lastEngagementAt ? Date.parse(lastEngagementAt) : NaN;
      const opens = Number(subscriber.attributes?.recentOpenCount ?? 0);
      const stale =
        opens === 0 ||
        !Number.isFinite(lastOpenedMs) ||
        now - lastOpenedMs > staleThresholdMs;
      return { subscriber, opens, lastEngagementAt, stale };
    })
    .filter((row) => row.stale)
    .map((row) => ({
      subscriber: row.subscriber,
      sendsConsidered: lookbackSends,
      opens: row.opens,
      lastEngagementAt: row.lastEngagementAt,
      draftWinBackSubject: `We miss you, ${row.subscriber.firstName || "friend"} — here's what's new`,
    }));

  return new Response(
    JSON.stringify({ count: atRisk.length, subscribers: atRisk }),
    { headers: { "content-type": "application/json" } },
  );
}
