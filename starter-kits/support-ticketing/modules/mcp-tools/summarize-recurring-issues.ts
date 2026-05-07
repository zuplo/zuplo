import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Ticket } from "../repositories/tickets.ts";

/**
 * Orchestrator: summarize_recurring_issues.
 *
 * Lists tickets opened in the last `daysBack` days, groups them by tag (simple
 * string match), and returns the top recurring tags with counts and a sample
 * of subject lines per tag.
 */

interface Body {
  daysBack?: number;
  topN?: number;
  samplePerTag?: number;
}

interface TicketPage {
  items: Ticket[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const daysBack = Math.max(1, Math.min(365, body.daysBack ?? 30));
  const topN = Math.max(1, Math.min(20, body.topN ?? 5));
  const samplePerTag = Math.max(1, Math.min(10, body.samplePerTag ?? 3));
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;

  const all: Ticket[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<TicketPage>(context, `/tickets?${qs}`, { headers: auth });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 5000) break;
  } while (cursor);

  const inWindow = all.filter(
    (t) => new Date(t.openedAt).getTime() >= cutoff,
  );

  // Group by tag. A ticket may belong to multiple tags.
  const byTag: Record<string, { count: number; samples: Array<{ id: string; subject: string }> }> = {};
  for (const t of inWindow) {
    for (const tag of t.tags ?? []) {
      const bucket = (byTag[tag] ??= { count: 0, samples: [] });
      bucket.count += 1;
      if (bucket.samples.length < samplePerTag) {
        bucket.samples.push({ id: t.id, subject: t.subject });
      }
    }
  }

  // Tickets with no tag get bucketed as "untagged" so they aren't invisible.
  const untagged = inWindow.filter((t) => (t.tags ?? []).length === 0);
  if (untagged.length > 0) {
    byTag["untagged"] = {
      count: untagged.length,
      samples: untagged.slice(0, samplePerTag).map((t) => ({ id: t.id, subject: t.subject })),
    };
  }

  const ranked = Object.entries(byTag)
    .map(([tag, data]) => ({ tag, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);

  return new Response(
    JSON.stringify({
      daysBack,
      windowStart: new Date(cutoff).toISOString(),
      ticketsConsidered: inWindow.length,
      topIssues: ranked,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
