import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Member } from "../repositories/members.ts";

/**
 * Orchestrator MCP tool: nominate_helpful_members.
 *
 * Ranks active members by helpfulCount (rolled up from "helpful" /
 * "insightful" reactions on their posts) and proposes badge awards
 * for members who cross a threshold but don't yet hold the badge.
 * Returns a curated nomination list — moderators apply the badges
 * via subsequent MCP calls.
 */

interface Body {
  minHelpfulCount?: number;
  limit?: number;
  badgeSlug?: string;
}

interface MemberPage {
  items: Member[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const minHelpfulCount = Math.max(1, body.minHelpfulCount ?? 10);
  const limit = Math.max(1, Math.min(100, body.limit ?? 25));
  const badgeSlug = body.badgeSlug ?? "helpful-contributor";
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const all: Member[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<MemberPage>(context, `/members?${qs}`, { headers: auth });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 10000) break;
  } while (cursor);

  const candidates = all
    .filter((m) => m.status === "active")
    .filter((m) => m.helpfulCount >= minHelpfulCount)
    .filter((m) => !m.badges.includes(badgeSlug))
    .sort((a, b) => b.helpfulCount - a.helpfulCount)
    .slice(0, limit)
    .map((m) => ({
      member: m,
      proposedBadgeSlug: badgeSlug,
      reason: `Reached ${m.helpfulCount} helpful reactions across ${m.postCount} posts.`,
    }));

  return new Response(
    JSON.stringify({
      proposedBadgeSlug: badgeSlug,
      threshold: minHelpfulCount,
      count: candidates.length,
      nominations: candidates,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
