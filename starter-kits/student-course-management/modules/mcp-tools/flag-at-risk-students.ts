import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Enrollment } from "../repositories/enrollments.ts";
import type { Student } from "../repositories/students.ts";
import type { Grade } from "../repositories/grades.ts";
import type { Attendance } from "../repositories/attendance.ts";

/**
 * Orchestrator MCP tool: flag_at_risk_students.
 *
 * Pulls active enrollments, joins with students, grades, and attendance,
 * and surfaces students who match any of the configured risk signals
 * (low average grade, high absence rate, missing assignments). The LLM
 * gets a structured payload it can use to compose intervention messages
 * or trigger downstream `recommend_remediation` runs.
 */

interface Body {
  /** Average grade percentage below this is "at risk". Defaults to 70. */
  failingGradePct?: number;
  /** Absence rate above this is "at risk". Defaults to 0.2 (20%). */
  absenceRateThreshold?: number;
  /** Look back window in days. Defaults to 60. */
  lookbackDays?: number;
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
    const page = await invokeJson<Page<T>>(
      context,
      `${path}${sep}${qs}`,
      { headers: auth },
    );
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 10000) break;
  } while (cursor);
  return all;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const failingGradePct = Math.max(0, Math.min(100, body.failingGradePct ?? 70));
  const absenceRateThreshold = Math.max(
    0,
    Math.min(1, body.absenceRateThreshold ?? 0.2),
  );
  const lookbackDays = Math.max(1, Math.min(365, body.lookbackDays ?? 60));
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

  const [enrollments, students, grades, attendance] = await Promise.all([
    drain<Enrollment>(context, "/enrollments", auth),
    drain<Student>(context, "/students", auth),
    drain<Grade>(context, "/grades", auth),
    drain<Attendance>(context, "/attendance", auth),
  ]);

  const studentById = new Map(students.map((s) => [s.id, s]));

  // Group grades by enrollment within the lookback window.
  const gradesByEnrollment = new Map<string, Grade[]>();
  for (const g of grades) {
    if (new Date(g.gradedAt).getTime() < cutoff) continue;
    const list = gradesByEnrollment.get(g.enrollmentId) ?? [];
    list.push(g);
    gradesByEnrollment.set(g.enrollmentId, list);
  }

  // Group attendance by student within the lookback window.
  const attendanceByStudent = new Map<string, Attendance[]>();
  for (const a of attendance) {
    if (new Date(a.markedAt).getTime() < cutoff) continue;
    const list = attendanceByStudent.get(a.studentId) ?? [];
    list.push(a);
    attendanceByStudent.set(a.studentId, list);
  }

  const flagged: Array<{
    studentId: string;
    student: Student | null;
    enrollmentId: string;
    courseId: string;
    averageGradePct: number | null;
    absenceRate: number | null;
    signals: string[];
  }> = [];

  for (const enrollment of enrollments) {
    if (enrollment.status !== "enrolled") continue;

    const enrollmentGrades = gradesByEnrollment.get(enrollment.id) ?? [];
    const studentAttendance = attendanceByStudent.get(enrollment.studentId) ?? [];

    let averageGradePct: number | null = null;
    if (enrollmentGrades.length > 0) {
      const total = enrollmentGrades.reduce(
        (sum, g) => sum + (g.maxScore > 0 ? (g.score / g.maxScore) * 100 : 0),
        0,
      );
      averageGradePct = total / enrollmentGrades.length;
    }

    let absenceRate: number | null = null;
    if (studentAttendance.length > 0) {
      const absences = studentAttendance.filter(
        (a) => a.status === "absent" || a.status === "late",
      ).length;
      absenceRate = absences / studentAttendance.length;
    }

    const signals: string[] = [];
    if (averageGradePct !== null && averageGradePct < failingGradePct) {
      signals.push(
        `average_grade_${averageGradePct.toFixed(1)}pct_below_${failingGradePct}`,
      );
    }
    if (absenceRate !== null && absenceRate > absenceRateThreshold) {
      signals.push(
        `absence_rate_${(absenceRate * 100).toFixed(1)}pct_above_${(
          absenceRateThreshold * 100
        ).toFixed(1)}`,
      );
    }
    if (enrollmentGrades.length === 0 && studentAttendance.length > 0) {
      signals.push("no_grades_recorded_in_window");
    }

    if (signals.length === 0) continue;

    flagged.push({
      studentId: enrollment.studentId,
      student: studentById.get(enrollment.studentId) ?? null,
      enrollmentId: enrollment.id,
      courseId: enrollment.courseId,
      averageGradePct,
      absenceRate,
      signals,
    });
  }

  return new Response(
    JSON.stringify({
      lookbackDays,
      failingGradePct,
      absenceRateThreshold,
      flaggedCount: flagged.length,
      flagged,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
