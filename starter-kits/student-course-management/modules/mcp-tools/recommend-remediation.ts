import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Enrollment } from "../repositories/enrollments.ts";
import type { Course } from "../repositories/courses.ts";
import type { Lesson } from "../repositories/lessons.ts";
import type { Grade } from "../repositories/grades.ts";

/**
 * Orchestrator MCP tool: recommend_remediation.
 *
 * For a single enrollment, looks at the student's grades by kind
 * (assignment / quiz / exam / participation) and recommends specific
 * remediation actions. Output is structured so the LLM can phrase the
 * recommendation in any tone or convert it into a calendar invite.
 */

interface Body {
  enrollmentId: string;
  /** Anything below this percentage is considered weak. Defaults to 75. */
  weakAreaThreshold?: number;
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
  if (!body.enrollmentId) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "enrollmentId is required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const weakAreaThreshold = Math.max(
    0,
    Math.min(100, body.weakAreaThreshold ?? 75),
  );
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const enrollment = await invokeJson<Enrollment>(
    context,
    `/enrollments/${encodeURIComponent(body.enrollmentId)}`,
    { headers: auth },
  ).catch(() => null);
  if (!enrollment || !enrollment.id) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Enrollment not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const course = await invokeJson<Course>(
    context,
    `/courses/${encodeURIComponent(enrollment.courseId)}`,
    { headers: auth },
  ).catch(() => null);

  const [allGrades, courseLessons] = await Promise.all([
    drain<Grade>(
      context,
      `/grades?enrollmentId=${encodeURIComponent(enrollment.id)}`,
      auth,
    ),
    drain<Lesson>(
      context,
      `/lessons?courseId=${encodeURIComponent(enrollment.courseId)}`,
      auth,
    ),
  ]);

  // Compute per-kind average.
  const sumsByKind: Record<Grade["kind"], { sum: number; count: number }> = {
    assignment: { sum: 0, count: 0 },
    quiz: { sum: 0, count: 0 },
    exam: { sum: 0, count: 0 },
    participation: { sum: 0, count: 0 },
  };
  for (const g of allGrades) {
    if (g.maxScore <= 0) continue;
    const pct = (g.score / g.maxScore) * 100;
    sumsByKind[g.kind].sum += pct;
    sumsByKind[g.kind].count += 1;
  }

  const weakAreas: Array<{ kind: Grade["kind"]; averagePct: number }> = [];
  for (const [kind, data] of Object.entries(sumsByKind)) {
    if (data.count === 0) continue;
    const avg = data.sum / data.count;
    if (avg < weakAreaThreshold) {
      weakAreas.push({ kind: kind as Grade["kind"], averagePct: avg });
    }
  }
  weakAreas.sort((a, b) => a.averagePct - b.averagePct);

  // Pick the next 3 upcoming lessons in this course as suggested study sessions.
  const now = Date.now();
  const upcomingLessons = courseLessons
    .filter((l) => new Date(l.scheduledFor).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
    )
    .slice(0, 3);

  const recommendations: Array<{
    area: Grade["kind"];
    action: string;
    suggestedLessonId: string | null;
  }> = weakAreas.map((wa, idx) => {
    const action =
      wa.kind === "exam"
        ? `Schedule a 1:1 review session before the next exam (current average ${wa.averagePct.toFixed(1)}%).`
        : wa.kind === "quiz"
          ? `Assign targeted quiz prep on weakest topics (current average ${wa.averagePct.toFixed(1)}%).`
          : wa.kind === "assignment"
            ? `Provide additional practice assignments with rubric feedback (current average ${wa.averagePct.toFixed(1)}%).`
            : `Increase classroom participation prompts and small-group discussion (current average ${wa.averagePct.toFixed(1)}%).`;
    return {
      area: wa.kind,
      action,
      suggestedLessonId: upcomingLessons[idx]?.id ?? null,
    };
  });

  return new Response(
    JSON.stringify({
      enrollment,
      course,
      weakAreaThreshold,
      weakAreas,
      recommendations,
      upcomingLessons,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
