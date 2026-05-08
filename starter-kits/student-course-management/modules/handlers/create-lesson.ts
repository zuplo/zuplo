import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { lessonRepository } from "../repositories/lessons.ts";
import { courseRepository } from "../repositories/courses.ts";
import { enrollmentRepository } from "../repositories/enrollments.ts";
import { studentRepository } from "../repositories/students.ts";
import { createGCalEvent } from "../integrations/google-calendar.ts";

interface Body {
  courseId: string;
  title: string;
  description: string;
  scheduledFor: string;
  durationMinutes: number;
  videoUrl?: string | null;
  /** When true, skip Google Calendar event creation. */
  silent?: boolean;
  /** When true, include enrolled students as attendees on the calendar event. Defaults to true. */
  inviteStudents?: boolean;
  /** When true, ask Google Calendar to create a Meet link. */
  createMeetLink?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  let calendarEventId: string | null = null;
  let calendarLink: string | null = null;
  let meetLink: string | null = null;
  let calendarError: string | null = null;

  if (!body.silent) {
    try {
      const course = await courseRepository
        .get(tenantId, body.courseId)
        .catch(() => null);
      const inviteStudents = body.inviteStudents !== false;

      let attendees: Array<{ email: string; displayName?: string }> = course
        ? [{ email: course.instructorEmail }]
        : [];

      if (inviteStudents) {
        // Enrolled students that are active become attendees. Cap pagination
        // to keep this handler bounded.
        let cursor: string | null | undefined = undefined;
        const enrolled: string[] = [];
        do {
          const page = await enrollmentRepository.list(tenantId, {
            where: { courseId: body.courseId },
            limit: 200,
            cursor,
          });
          for (const e of page.items) {
            if (e.status === "enrolled") enrolled.push(e.studentId);
          }
          cursor = page.nextCursor;
          if (enrolled.length > 1000) break;
        } while (cursor);

        for (const id of enrolled) {
          const s = await studentRepository.get(tenantId, id).catch(() => null);
          if (s?.email) {
            attendees.push({
              email: s.email,
              displayName: `${s.firstName} ${s.lastName}`.trim(),
            });
          }
        }
      }

      const startIso = body.scheduledFor;
      const endIso = new Date(
        new Date(body.scheduledFor).getTime() + body.durationMinutes * 60_000,
      ).toISOString();
      const event = await createGCalEvent({
        summary: `${course?.name ? `[${course.name}] ` : ""}${body.title}`,
        description: [
          body.description,
          body.videoUrl ? `Recording: ${body.videoUrl}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        start: { dateTime: startIso },
        end: { dateTime: endIso },
        attendees,
        extendedProperties: {
          private: {
            kitTenantId: tenantId,
            kitCourseId: body.courseId,
          },
        },
        conferenceData: body.createMeetLink
          ? {
              createRequest: {
                requestId: `${tenantId}-${body.courseId}-${Date.now()}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            }
          : undefined,
        sendUpdates: attendees.length > 0 ? "all" : "none",
      });
      calendarEventId = event.id;
      calendarLink = event.htmlLink;
      meetLink = event.hangoutLink ?? null;
    } catch (err) {
      calendarError = (err as Error).message;
    }
  }

  const created = await lessonRepository.create(tenantId, {
    courseId: body.courseId,
    title: body.title,
    description: body.description,
    scheduledFor: body.scheduledFor,
    durationMinutes: body.durationMinutes,
    videoUrl: body.videoUrl ?? meetLink,
    calendarEventId,
    createdAt: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({
      lesson: created,
      calendarEventId,
      calendarLink,
      meetLink,
      calendarError,
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
