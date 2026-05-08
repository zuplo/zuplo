import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  interviewRepository,
  type Interview,
} from "../repositories/interviews.ts";
import { createCalendarEvent } from "../integrations/google-calendar.ts";

interface Body {
  applicationId: string;
  scheduledAt: string;
  kind: Interview["kind"];
  interviewerEmail: string;
  candidateEmail?: string;
  durationMinutes?: number;
  title?: string;
  description?: string;
  location?: string;
  timeZone?: string;
  createMeetLink?: boolean;
}

/**
 * Schedule an interview, persist it, and (when a candidateEmail is supplied
 * and Google Calendar is configured) create a Calendar event with both
 * parties on the invite. Calendar failures are captured on the Interview
 * row but do NOT fail the request — the interview is still scheduled in
 * the ATS even if Calendar is down.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const durationMinutes = body.durationMinutes ?? 45;

  let calendarEventId: string | null = null;
  let calendarEventLink: string | null = null;
  let meetLink: string | null = null;
  let calendarError: string | null = null;

  if (body.candidateEmail) {
    try {
      const startDate = new Date(body.scheduledAt);
      if (Number.isNaN(startDate.getTime())) {
        throw new Error(`Invalid scheduledAt timestamp: ${body.scheduledAt}`);
      }
      const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

      const event = await createCalendarEvent({
        summary: body.title ?? `Interview — ${body.kind}`,
        description: body.description,
        location: body.location,
        start: { dateTime: startDate.toISOString(), timeZone: body.timeZone },
        end: { dateTime: endDate.toISOString(), timeZone: body.timeZone },
        attendees: [
          { email: body.interviewerEmail },
          { email: body.candidateEmail },
        ],
        sendUpdates: "all",
        conferenceRequestId: body.createMeetLink
          ? `ats-${tenantId}-${Date.now()}`
          : undefined,
      });
      calendarEventId = event.id;
      calendarEventLink = event.htmlLink;
      meetLink = event.hangoutLink ?? null;
    } catch (err) {
      calendarError = (err as Error).message;
    }
  }

  const created = await interviewRepository.create(tenantId, {
    applicationId: body.applicationId,
    scheduledAt: body.scheduledAt,
    kind: body.kind,
    interviewerEmail: body.interviewerEmail,
    candidateEmail: body.candidateEmail ?? null,
    durationMinutes,
    calendarEventId,
    calendarEventLink,
    meetLink,
    calendarError,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
