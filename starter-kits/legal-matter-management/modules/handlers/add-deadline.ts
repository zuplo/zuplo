import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  deadlineRepository,
  matterRepository,
  type Deadline,
} from "../repositories/matters.ts";
import { createGCalEvent } from "../integrations/google-calendar.ts";

interface Body {
  matterId: string;
  title: string;
  dueDate: string;
  kind: Deadline["kind"];
  /** Optional attorney/clerk emails to invite to the calendar event. */
  attendees?: string[];
  /** When true, suppress Google Calendar event creation. */
  silent?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  let calendarEventId: string | null = null;
  let calendarLink: string | null = null;
  let calendarError: string | null = null;

  if (!body.silent) {
    try {
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate);
      const start = isDateOnly
        ? { date: body.dueDate.slice(0, 10) }
        : { dateTime: body.dueDate };
      const endIso = isDateOnly
        ? body.dueDate.slice(0, 10)
        : new Date(new Date(body.dueDate).getTime() + 30 * 60 * 1000).toISOString();
      const end = isDateOnly ? { date: endIso } : { dateTime: endIso };

      // Pull matter title for a friendlier event summary.
      const matter = await matterRepository
        .get(tenantId, body.matterId)
        .catch(() => null);
      const summaryPrefix =
        body.kind === "court"
          ? "[COURT DEADLINE]"
          : body.kind === "client"
            ? "[Client deadline]"
            : "[Internal deadline]";
      const event = await createGCalEvent({
        summary: `${summaryPrefix} ${body.title}${matter ? ` — ${matter.title}` : ""}`,
        description: matter
          ? `Matter: ${matter.title} (${matter.kind}). Lead: ${matter.leadAttorneyEmail}.`
          : `Matter: ${body.matterId}`,
        start,
        end,
        attendees: body.attendees?.map((email) => ({ email })),
        extendedProperties: {
          private: {
            kitMatterId: body.matterId,
            kitTenantId: tenantId,
            kitDeadlineKind: body.kind,
          },
        },
        sendUpdates: body.attendees?.length ? "all" : "none",
      });
      calendarEventId = event.id;
      calendarLink = event.htmlLink;
    } catch (err) {
      calendarError = (err as Error).message;
    }
  }

  const created = await deadlineRepository.create(tenantId, {
    matterId: body.matterId,
    title: body.title,
    dueDate: body.dueDate,
    kind: body.kind,
    status: "upcoming",
    calendarEventId,
    createdAt: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({
      deadline: created,
      calendarEventId,
      calendarLink,
      calendarError,
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
