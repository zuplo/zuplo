import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Announcement } from "../repositories/announcements.ts";

/**
 * Orchestrator MCP tool: summarize_week_for_team.
 *
 * Returns published announcements for an audience over the 7-day window
 * starting at weekStartDate, grouped by category. Useful for an LLM to draft
 * a Monday digest or write a team status email.
 */

interface Body {
  audienceSlug: string;
  weekStartDate: string;
}

interface AnnouncementPage {
  items: Announcement[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.audienceSlug || !body.weekStartDate) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "audienceSlug and weekStartDate are required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const start = new Date(body.weekStartDate);
  if (Number.isNaN(start.getTime())) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "weekStartDate must be a parseable date" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const all: Announcement[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<AnnouncementPage>(context, `/announcements?${qs}`, { headers: auth });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 5000) break;
  } while (cursor);

  const inWeek = all.filter((a) => {
    if (a.status !== "published" || a.audienceSlug !== body.audienceSlug) return false;
    if (!a.publishedAt) return false;
    const t = new Date(a.publishedAt).getTime();
    return t >= start.getTime() && t < end.getTime();
  });

  const byCategory: Record<string, Announcement[]> = {};
  for (const announcement of inWeek) {
    const key = announcement.categorySlug ?? "uncategorized";
    (byCategory[key] ??= []).push(announcement);
  }

  return new Response(
    JSON.stringify({
      audienceSlug: body.audienceSlug,
      weekStart: start.toISOString(),
      weekEnd: end.toISOString(),
      total: inWeek.length,
      byCategory,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
