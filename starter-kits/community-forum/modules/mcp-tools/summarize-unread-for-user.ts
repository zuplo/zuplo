import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Topic } from "../repositories/topics.ts";

/**
 * Orchestrator MCP tool: summarize_unread_for_user.
 *
 * Lists topics in the tenant, filters to those with new activity since
 * the user's `lastSeenAt` (any reply or new topic posted after that
 * timestamp), and returns a compact digest grouped by category. The
 * LLM uses the digest to write a "what you missed" message.
 */

interface Body {
  memberEmail: string;
  lastSeenAt: string;
  topPerCategory?: number;
}

interface TopicPage {
  items: Topic[];
  nextCursor: string | null;
}

interface DigestEntry {
  topic: Topic;
  daysSinceLastReply: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const topPerCategory = Math.max(1, Math.min(20, body.topPerCategory ?? 5));
  const since = new Date(body.lastSeenAt).getTime();
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const all: Topic[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<TopicPage>(context, `/topics?${qs}`, { headers: auth });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 5000) break;
  } while (cursor);

  const now = Date.now();
  const fresh = all.filter((t) => {
    if (t.status === "archived") return false;
    const lastActivity = t.lastReplyAt
      ? new Date(t.lastReplyAt).getTime()
      : new Date(t.createdAt).getTime();
    if (lastActivity <= since) return false;
    // The user's own posts don't count as unread for them.
    if (t.lastReplyBy && t.lastReplyBy === body.memberEmail) return false;
    return true;
  });

  // Group + truncate per category, ordered by recency.
  const byCategory: Record<string, DigestEntry[]> = {};
  for (const topic of fresh.sort((a, b) => {
    const aT = new Date(a.lastReplyAt ?? a.createdAt).getTime();
    const bT = new Date(b.lastReplyAt ?? b.createdAt).getTime();
    return bT - aT;
  })) {
    const list = (byCategory[topic.categorySlug] ??= []);
    if (list.length >= topPerCategory) continue;
    const lastActivity = new Date(topic.lastReplyAt ?? topic.createdAt).getTime();
    list.push({
      topic,
      daysSinceLastReply: Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24)),
    });
  }

  return new Response(
    JSON.stringify({
      memberEmail: body.memberEmail,
      lastSeenAt: body.lastSeenAt,
      unreadTopicCount: fresh.length,
      byCategory,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
