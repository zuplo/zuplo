import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Enrollment } from "../repositories/enrollments.ts";
import type { Student } from "../repositories/students.ts";
import type { Course } from "../repositories/courses.ts";
import type { Grade } from "../repositories/grades.ts";
import type { Attendance } from "../repositories/attendance.ts";

/**
 * Orchestrator MCP tool: draft_progress_report.
 *
 * Builds a per-student progress report combining their enrolled courses,
 * recent grades, attendance, and a draft narrative paragraph. The output
 * is structured for an LLM to fan out to individual emails or to compile
 * into a parent-facing summary.
 */

interface Body {
  studentId: string;
  /** Optional course filter. If omitted, all of the student's enrollments are reported. */
  courseId?: string;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

async function drain<T>(
  context: ZuploContext,
  path: string,
  auth: { authorization: string },
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const sep = path.includes("?") ? "&" : "?";
    const page = await invokeJson<Page<T>>(context, `${path}${sep}${qs}`, {
      headers: auth,
    });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 10000) break;
  } while (cursor);
  return all;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.studentId) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "studentId is required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const student = await invokeJson<Student>(
    context,
    `/students/${encodeURIComponent(body.studentId)}`,
    { headers: auth },
  ).catch(() => null);
  if (!student || !student.id) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Student not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const [enrollments, courses, grades, attendance] = await Promise.all([
    drain<Enrollment>(context, "/enrollments", auth),
    drain<Course>(context, "/courses", auth),
    drain<Grade>(context, "/grades", auth),
    drain<Attendance>(context, `/attendance?studentId=${encodeURIComponent(body.studentId)}`, auth),
  ]);

  const studentEnrollments = enrollments.filter(
    (e) => e.studentId === body.studentId && (!body.courseId || e.courseId === body.courseId),
  );

  const courseById = new Map(courses.map((c) => [c.id, c]));

  const sections = studentEnrollments.map((enrollment) => {
    const course = courseById.get(enrollment.courseId) ?? null;
    const enrollmentGrades = grades.filter((g) => g.enrollmentId === enrollment.id);

    let averageGradePct: number | null = null;
    if (enrollmentGrades.length > 0) {
      const total = enrollmentGrades.reduce(
        (sum, g) => sum + (g.maxScore > 0 ? (g.score / g.maxScore) * 100 : 0),
        0,
      );
      averageGradePct = total / enrollmentGrades.length;
    }

    const present = attendance.filter((a) => a.status === "present").length;
    const total = attendance.length;
    const attendanceRate = total > 0 ? present / total : null;

    const courseName = course?.name ?? `course ${enrollment.courseId}`;
    const avgText =
      averageGradePct !== null ? `${averageGradePct.toFixed(1)}%` : "no grades yet";
    const attendanceText =
      attendanceRate !== null
        ? `${(attendanceRate * 100).toFixed(0)}% attendance`
        : "no attendance recorded";

    const narrative = `${student.firstName} ${student.lastName} is currently ${enrollment.status} in ${courseName}. Their current average is ${avgText} across ${enrollmentGrades.length} graded items, with ${attendanceText}.`;

    return {
      enrollmentId: enrollment.id,
      courseId: enrollment.courseId,
      courseName,
      enrollmentStatus: enrollment.status,
      averageGradePct,
      gradeCount: enrollmentGrades.length,
      attendanceRate,
      narrative,
      recentGrades: enrollmentGrades.slice(0, 5),
    };
  });

  return new Response(
    JSON.stringify({
      student,
      generatedAt: new Date().toISOString(),
      sections,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
