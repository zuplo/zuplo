import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Activity } from "../repositories/activities.ts";
import type { Note } from "../repositories/notes.ts";
import type { Deal } from "../repositories/deals.ts";
import type { Contact } from "../repositories/contacts.ts";
import { callClaude } from "../integrations/claude.ts";
import { listGCalEvents } from "../integrations/google-calendar.ts";

interface Body {
  accountId: string;
  /** When true, ask Claude to summarize the timeline into a pre-call brief. */
  summarize?: boolean;
  /** Optional: pull Google Calendar events for these attendee emails. */
  calendarAttendees?: string[];
  /** Days back to pull from calendar. Defaults to 30. */
  calendarDaysBack?: number;
}

interface Page<T> { items: T[]; nextCursor: string | null; }

interface TimelineEvent {
  kind: "activity" | "note" | "deal_created" | "deal_updated" | "calendar";
  occurredAt: string;
  ownerEmail: string;
  summary: string;
  refId: string;
}

/**
 * Orchestrator: account_timeline (Claude-powered).
 *
 * Returns a merged chronological list of activities, notes, deal events,
 * and (optionally) Google Calendar meetings across the account. When
 * `summarize: true`, hands the timeline to Claude and returns a pre-call
 * brief — the kind of paragraph an AE would scribble before dialing the
 * customer.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";

  // Resolve set of contact ids belonging to the account so we can match
  // activities/notes attached to those contacts (rather than the account).
  const contactIds = new Set<string>();
  let cCursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cCursor) qs.set("cursor", cCursor);
    const page = await invokeJson<Page<Contact>>(context, `/contacts?${qs}`, {
      headers: { authorization: auth },
    });
    for (const c of page.items) {
      if (c.accountId === body.accountId) contactIds.add(c.id);
    }
    cCursor = page.nextCursor;
  } while (cCursor);

  const events: TimelineEvent[] = [];

  // Activities
  let aCursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (aCursor) qs.set("cursor", aCursor);
    const page = await invokeJson<Page<Activity>>(context, `/activities?${qs}`, {
      headers: { authorization: auth },
    });
    for (const a of page.items) {
      const matches =
        a.accountId === body.accountId ||
        (a.contactId && contactIds.has(a.contactId));
      if (!matches) continue;
      events.push({
        kind: "activity",
        occurredAt: a.occurredAt,
        ownerEmail: a.ownerEmail,
        summary: `[${a.kind}] ${a.subject}`,
        refId: a.id,
      });
    }
    aCursor = page.nextCursor;
    if (events.length > 5000) break;
  } while (aCursor);

  // Notes
  let nCursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (nCursor) qs.set("cursor", nCursor);
    const page = await invokeJson<Page<Note>>(context, `/notes?${qs}`, {
      headers: { authorization: auth },
    }).catch(() => ({ items: [], nextCursor: null }) as Page<Note>);
    for (const n of page.items) {
      const matches =
        n.accountId === body.accountId ||
        (n.contactId && contactIds.has(n.contactId));
      if (!matches) continue;
      events.push({
        kind: "note",
        occurredAt: n.createdAt,
        ownerEmail: n.authorEmail,
        summary: n.body.slice(0, 120),
        refId: n.id,
      });
    }
    nCursor = page.nextCursor;
    if (events.length > 10000) break;
  } while (nCursor);

  // Deals
  let dCursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (dCursor) qs.set("cursor", dCursor);
    const page = await invokeJson<Page<Deal>>(context, `/deals?${qs}`, {
      headers: { authorization: auth },
    });
    for (const d of page.items) {
      if (d.accountId !== body.accountId) continue;
      events.push({
        kind: "deal_created",
        occurredAt: d.createdAt,
        ownerEmail: d.ownerEmail,
        summary: `Deal '${d.name}' created (${d.stage})`,
        refId: d.id,
      });
      if (d.updatedAt && d.updatedAt !== d.createdAt) {
        events.push({
          kind: "deal_updated",
          occurredAt: d.updatedAt,
          ownerEmail: d.ownerEmail,
          summary: `Deal '${d.name}' updated (now ${d.stage})`,
          refId: d.id,
        });
      }
    }
    dCursor = page.nextCursor;
  } while (dCursor);

  // Optional: pull Google Calendar meetings tied to the account's people.
  const attendees = body.calendarAttendees ?? [];
  if (attendees.length > 0 && process.env.GOOGLE_CALENDAR_ACCESS_TOKEN) {
    const daysBack = body.calendarDaysBack ?? 30;
    const timeMin = new Date(
      Date.now() - daysBack * 86400000,
    ).toISOString();
    for (const email of attendees) {
      try {
        const calEvents = await listGCalEvents({
          attendeeEmail: email,
          timeMin,
          maxResults: 50,
        });
        for (const ev of calEvents) {
          events.push({
            kind: "calendar",
            occurredAt: ev.start.dateTime,
            ownerEmail: email,
            summary: `[meeting] ${ev.summary ?? "(no title)"}`,
            refId: ev.id,
          });
        }
      } catch (err) {
        context.log.warn(
          `Google Calendar lookup failed for ${email}: ${(err as Error).message}`,
        );
      }
    }
  }

  events.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

  let summary: string | undefined;
  if (body.summarize) {
    const lines = events.slice(0, 80).map(
      (e) => `- ${e.occurredAt} (${e.ownerEmail}) ${e.kind}: ${e.summary}`,
    );
    const claude = await callClaude({
      system:
        "You are a sales operations assistant. Summarize an account's recent CRM activity into a short pre-call brief for an AE. Highlight the most recent meaningful interactions, who has been involved, the current deal state, and any silence or risk signals. Keep it under 200 words. Use plain prose, no bullet points.",
      messages: [
        {
          role: "user",
          content:
            `Account id: ${body.accountId}\n\nMost recent events (newest first):\n${lines.join("\n")}`,
        },
      ],
      maxTokens: 600,
    });
    summary = claude.text.trim();
  }

  return new Response(
    JSON.stringify({
      accountId: body.accountId,
      count: events.length,
      events,
      summary,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
