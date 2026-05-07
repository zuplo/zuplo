import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Announcement, Acknowledgement } from "../repositories/announcements.ts";

/**
 * Orchestrator MCP tool: find_unread_critical_for_user.
 *
 * Returns published announcements with priority "critical" that the given
 * employee has not yet acknowledged. The agent uses this to nudge the user
 * (or HR) on unread, important items.
 */

interface Body {
  employeeEmail: string;
}

interface AnnouncementPage {
  items: Announcement[];
  nextCursor: string | null;
}

interface AcknowledgementPage {
  items: Acknowledgement[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.employeeEmail) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "employeeEmail is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const announcements: Announcement[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<AnnouncementPage>(context, `/announcements?${qs}`, { headers: auth });
    announcements.push(...page.items);
    cursor = page.nextCursor;
    if (announcements.length > 5000) break;
  } while (cursor);

  const acks: Acknowledgement[] = [];
  let acksCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (acksCursor) qs.set("cursor", acksCursor);
    const page = await invokeJson<AcknowledgementPage>(context, `/acknowledgements?${qs}`, { headers: auth });
    acks.push(...page.items);
    acksCursor = page.nextCursor;
    if (acks.length > 10000) break;
  } while (acksCursor);

  const ackedIds = new Set(
    acks
      .filter((a) => a.employeeEmail.toLowerCase() === body.employeeEmail.toLowerCase())
      .map((a) => a.announcementId),
  );

  const unread = announcements.filter(
    (a) => a.status === "published" && a.priority === "critical" && !ackedIds.has(a.id),
  );

  return new Response(
    JSON.stringify({
      employeeEmail: body.employeeEmail,
      unreadCount: unread.length,
      unread,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
